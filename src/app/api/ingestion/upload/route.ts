import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { requireCompletedOnboarding } from '@/lib/onboarding-store';

export const runtime = 'nodejs';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_SIGNATURE = '%PDF-';
const ALLOWED_CATEGORIES = new Set([
  'BANK_ACTIVITY',
  'PRODUCT_SALES',
  'CURRENT_INVENTORY',
  'PURCHASES_SUPPLIERS',
  'PURCHASES',
  'OPEN_OBLIGATIONS',
  'RECURRING_EXPENSES',
]);
const ALLOWED_PURPOSES = new Set([
  'ONBOARDING_BASELINE',
  'PERIODIC_UPDATE',
]);

type Outputs = {
  auth?: { aws_region?: string };
  data?: { aws_region?: string };
  custom?: Record<string, string>;
  storage?: { bucket_name?: string };
};

function loadOutputs(): Outputs {
  try {
    const file = path.join(process.cwd(), 'amplify_outputs.json');
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Outputs) : {};
  } catch {
    return {};
  }
}

const outputs = loadOutputs();
const region = process.env.AWS_REGION
  || outputs.data?.aws_region
  || outputs.auth?.aws_region
  || outputs.custom?.awsRegion
  || 'ap-south-1';
const bucketName = process.env.S3_BUCKET_NAME || outputs.storage?.bucket_name;
const documentTableName = process.env.DOCUMENT_RECORD_TABLE_NAME || outputs.custom?.documentRecordTableName;
const s3Client = new S3Client({ region });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

function cleanFileName(name: string): string {
  const basename = name.split(/[\\/]/).pop() || 'document.pdf';
  const normalized = basename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_');
  const withoutTraversal = normalized.replace(/\.\.+/g, '.');
  return withoutTraversal.toLowerCase().endsWith('.pdf')
    ? withoutTraversal.slice(0, 180)
    : `${withoutTraversal.slice(0, 176)}.pdf`;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isAllowed(value: FormDataEntryValue | null, allowed: Set<string>): value is string {
  return typeof value === 'string' && allowed.has(value);
}

function canonicalCategory(value: string): string {
  return value === 'PURCHASES' ? 'PURCHASES_SUPPLIERS' : value;
}

/**
 * Uploads are intentionally only an authenticated enqueue operation. S3 events
 * invoke the extractor/normalizer state machine; this route never invokes a
 * Lambda synchronously and never trusts a tenant id supplied by the browser.
 */
export async function POST(request: Request) {
  let objectKey: string | undefined;
  try {
    const principal = await requirePrincipal(request);
    const tenantId = principal;

    if (!bucketName || !documentTableName) return jsonError('Ingestion storage is not configured', 503);
    if (!(request.headers.get('content-type') || '').toLowerCase().includes('multipart/form-data')) {
      return jsonError('Upload a PDF as multipart/form-data', 415);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return jsonError('A file is required', 400);
    if (file.type !== 'application/pdf') return jsonError('Only application/pdf files are accepted', 415);
    if (file.size <= 0 || file.size > MAX_PDF_BYTES) return jsonError('PDF files must be between 1 byte and 10 MB', 413);

    const purposeValue = formData.get('purpose');
    const categoryValue = formData.get('category');
    if (!isAllowed(purposeValue, ALLOWED_PURPOSES)) return jsonError('A valid document purpose is required', 400);
    if (!isAllowed(categoryValue, ALLOWED_CATEGORIES)) return jsonError('A valid document category is required', 400);

    if (purposeValue === 'PERIODIC_UPDATE') {
      await requireCompletedOnboarding(tenantId);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, PDF_SIGNATURE.length).toString('ascii') !== PDF_SIGNATURE) {
      return jsonError('The uploaded file is not a valid PDF', 415);
    }

    const purpose = purposeValue;
    const category = canonicalCategory(categoryValue);
    const documentId = randomUUID();
    const fileName = cleanFileName(file.name);
    objectKey = `tenants/${tenantId}/documents/${documentId}/${fileName}`;
    const now = new Date().toISOString();
    const documentRecord = {
      id: documentId,
      tenantId,
      fileName,
      s3Key: objectKey,
      fileType: 'application/pdf',
      purpose,
      category,
      status: 'PENDING',
      validationStatus: 'PENDING',
      validationIssues: [],
      extractedEntityCount: 0,
      createdAt: now,
      updatedAt: now,
      __typename: 'DocumentRecord',
    };

    await docClient.send(new PutCommand({
      TableName: documentTableName,
      Item: documentRecord,
      ConditionExpression: 'attribute_not_exists(id)',
    }));

    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: bytes,
        ContentType: 'application/pdf',
        Metadata: { documentId, purpose, category },
        ServerSideEncryption: 'AES256',
      }));
    } catch (error) {
      try {
        await docClient.send(new DeleteCommand({ TableName: documentTableName, Key: { id: documentId } }));
      } catch (cleanupError) {
        console.error('Failed to clean up pending document after S3 upload failure', cleanupError);
      }
      throw error;
    }

    return NextResponse.json({ documentId, status: 'PENDING' }, { status: 202 });
  } catch (error) {
    console.error('Document upload failed', error);
    if (error instanceof AuthenticationError) return jsonError(error.message, 401);
    if (error instanceof AuthenticationConfigurationError) return jsonError(error.message, 503);
    if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
      return jsonError(error instanceof Error ? error.message : 'Upload is not allowed', error.status);
    }
    return jsonError(error instanceof Error ? error.message : 'Document upload failed', 500);
  }
}
