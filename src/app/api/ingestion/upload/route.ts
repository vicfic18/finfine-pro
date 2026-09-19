import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { invalidateDashboardCache } from '@/lib/financial-store';

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName =
  process.env.S3_BUCKET_NAME || 'amplify-finfinepro-vicfic-finfinedocumentstoragebu-nm3ks1cueqmt';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';

// Canonical DynamoDB Tables
const docTableName =
  process.env.DOCUMENT_RECORD_TABLE_NAME || 'DocumentRecord-ifsueqzwybf6nau7duulv5qweq-NONE';
const txnTableName =
  process.env.TRANSACTION_TABLE_NAME || 'Transaction-ifsueqzwybf6nau7duulv5qweq-NONE';
const oblTableName =
  process.env.OBLIGATION_TABLE_NAME || 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';
const prodTableName =
  process.env.PRODUCT_TABLE_NAME || 'Product-ifsueqzwybf6nau7duulv5qweq-NONE';
const purchaseTableName =
  process.env.PURCHASE_TABLE_NAME || 'Purchase-ifsueqzwybf6nau7duulv5qweq-NONE';
const purchaseLineItemTableName =
  process.env.PURCHASE_LINE_ITEM_TABLE_NAME || 'PurchaseLineItem-ifsueqzwybf6nau7duulv5qweq-NONE';
const cashPositionTableName =
  process.env.CASH_POSITION_TABLE_NAME || 'CashPositionSnapshot-ifsueqzwybf6nau7duulv5qweq-NONE';
const supplierProfileTableName =
  process.env.SUPPLIER_PROFILE_TABLE_NAME || 'SupplierProfile-ifsueqzwybf6nau7duulv5qweq-NONE';

const s3Client = new S3Client({ region });
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function POST(request: Request) {
  try {
    let fileBuffer: Buffer;
    let fileName: string;
    let fileType = 'application/pdf';
    let docType = 'BANK_STATEMENT';
    let manualMetadata: any = {};

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (body.useSample) {
        // Load the bundled sample UPI statement PDF
        const samplePdfPath = path.join(process.cwd(), 'sample_data/sample_upi_bank_statement.pdf');
        if (!fs.existsSync(samplePdfPath)) {
          throw new Error('Sample statement PDF not found at ' + samplePdfPath);
        }
        fileBuffer = fs.readFileSync(samplePdfPath);
        fileName = `hdfc_current_account_oct2026_${Date.now()}.pdf`;
        docType = 'BANK_STATEMENT';
      } else if (body.rawBase64) {
        fileBuffer = Buffer.from(body.rawBase64, 'base64');
        fileName = body.fileName || `doc_${Date.now()}.pdf`;
        fileType = body.fileType || 'application/pdf';
        docType = body.documentType || 'BANK_STATEMENT';
        manualMetadata = body.metadata || {};
      } else {
        throw new Error('Unsupported JSON payload. Provide useSample: true or rawBase64.');
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      docType = (formData.get('documentType') as string) || 'BANK_STATEMENT';
      const customVendor = formData.get('counterpartyName') as string | null;
      const customAmount = formData.get('amount') as string | null;

      if (customVendor || customAmount) {
        manualMetadata = {
          counterpartyName: customVendor,
          amount: customAmount ? parseFloat(customAmount) : undefined,
          invoiceNumber: formData.get('invoiceNumber'),
          dueDate: formData.get('dueDate'),
          gstin: formData.get('gstin'),
        };
      }

      if (!file) {
        return NextResponse.json({ error: 'No file provided in form-data' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      fileName = file.name || `upload_${Date.now()}`;
      fileType = file.type || 'application/pdf';
    } else {
      return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
    }

    const timestamp = Date.now();
    const documentId = docType === 'BANK_STATEMENT' ? `stmt-${timestamp}` : `inv-${timestamp}`;
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `public/tenants/${tenantId}/raw/${documentId}-${sanitizedFileName}`;

    console.log(`[Ingestion API] 1. Uploading ${fileBuffer.length} bytes to Amazon S3: s3://${bucketName}/${s3Key}`);

    // 1. Upload to Amazon S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: fileType,
        Metadata: {
          tenantId,
          documentId,
          documentType: docType,
        },
      })
    );

    console.log('[Ingestion API] S3 Upload successful. Invoking Document Extraction & Normalization pipeline...');

    // 2. Set environment variables for Lambda handlers
    process.env.DOCUMENT_RECORD_TABLE_NAME = docTableName;
    process.env.TRANSACTION_TABLE_NAME = txnTableName;
    process.env.OBLIGATION_TABLE_NAME = oblTableName;
    process.env.PRODUCT_TABLE_NAME = prodTableName;
    process.env.PURCHASE_TABLE_NAME = purchaseTableName;
    process.env.PURCHASE_LINE_ITEM_TABLE_NAME = purchaseLineItemTableName;
    process.env.CASH_POSITION_TABLE_NAME = cashPositionTableName;
    process.env.SUPPLIER_PROFILE_TABLE_NAME = supplierProfileTableName;

    // 3. Execute Document Extractor & Ingestion Normalizer
    const { handler: extractorHandler } = await import(
      '../../../../../amplify/functions/document-extractor/handler'
    );
    const { handler: normalizerHandler } = await import(
      '../../../../../amplify/functions/ingestion-normalizer/handler'
    );

    const extractOutput = await (extractorHandler as any)({
      bucket: bucketName,
      key: s3Key,
      tenantId,
      documentId,
      documentType: docType,
      manualMetadata,
    });

    const pipelineResult = await (normalizerHandler as any)(extractOutput);

    const extractedCount =
      (pipelineResult?.summary?.transactionCount || 0) +
      (pipelineResult?.summary?.obligationCount || 0) +
      (pipelineResult?.summary?.productCount || 0) +
      (pipelineResult?.summary?.purchaseCount || 0);

    console.log(
      `[Ingestion API] Successfully processed document ${documentId}: ${extractedCount} entities normalized into DynamoDB.`
    );

    // 4. Invalidate memory cache so dashboard instantly fetches fresh canonical metrics
    invalidateDashboardCache();

    return NextResponse.json({
      success: true,
      documentId,
      fileName: sanitizedFileName,
      s3Key,
      documentType: docType,
      extractedEntityCount: extractedCount,
      message:
        docType === 'BANK_STATEMENT'
          ? `Successfully uploaded to S3 and normalized ${pipelineResult?.summary?.transactionCount || 0} bank transactions into DynamoDB ledger.`
          : `Successfully uploaded bill to S3 and persisted canonical Product, Purchase, SupplierProfile, and Obligation records.`,
      pipelineSummary: pipelineResult?.summary || null,
    });
  } catch (err: any) {
    console.error('Failed to ingest document:', err);
    return NextResponse.json(
      { error: 'Document ingestion failed', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
