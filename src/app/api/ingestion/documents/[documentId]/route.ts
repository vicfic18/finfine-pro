import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { documentExtractionView } from '@/lib/document-presentation';

export const runtime = 'nodejs';
type Outputs = {
  auth?: { aws_region?: string };
  data?: { aws_region?: string };
  custom?: Record<string, string>;
};
function outputs(): Outputs {
  try {
    const file = path.join(process.cwd(), 'amplify_outputs.json');
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Outputs) : {};
  } catch { return {}; }
}
const configured = outputs();
const tableName = process.env.DOCUMENT_RECORD_TABLE_NAME || configured.custom?.documentRecordTableName;
const confirmationTableName = process.env.MERCHANT_FIELD_CONFIRMATION_TABLE_NAME || configured.custom?.merchantFieldConfirmationTableName;
const region = process.env.AWS_REGION
  || configured.data?.aws_region
  || configured.auth?.aws_region
import { getAwsClientConfig } from '@/lib/aws-client-config';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(getAwsClientConfig(region)), {
  marshallOptions: { removeUndefinedValues: true },
});

function metadata(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value) return value as Record<string, unknown>;
  if (typeof value === 'string') { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
  return {};
}

function safeResponse(item: Record<string, unknown>) {
  const raw = metadata(item.rawMetadata);
  return {
    id: item.id,
    fileName: item.fileName,
    purpose: item.purpose || raw.purpose || 'SUPPORTING_DOCUMENT',
    category: item.category || raw.category || 'OTHER',
    detectedCategories: item.detectedCategories || raw.detectedCategories || [],
    status: item.status || 'PENDING',
    validationStatus: item.validationStatus || raw.validationStatus || 'PENDING',
    validationIssues: item.validationIssues || raw.validationIssues || [],
    reportingPeriod: item.reportingPeriod || raw.reportingPeriod || (item.reportingStartDate || item.reportingEndDate ? { startDate: item.reportingStartDate, endDate: item.reportingEndDate } : null),
    extractedEntityCount: item.extractedEntityCount ?? 0,
    ...documentExtractionView(raw),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    processedAt: item.processedAt,
    errorMessage: item.errorMessage,
  };
}

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const tenantId = principal;
    const { documentId } = await context.params;
    if (!tableName || !documentId || documentId.includes('/')) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const result = await client.send(new GetCommand({ TableName: tableName, Key: { id: documentId } }));
    if (!result.Item || result.Item.tenantId !== tenantId) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    return NextResponse.json({ document: safeResponse(result.Item) });
  } catch (error) {
    console.error('Failed to load document status', error);
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthenticationConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: 'Failed to retrieve document status' }, { status: 500 });
  }
}

/** Store corrections as append-only confirmations; the extracted raw payload stays immutable. */
export async function PATCH(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const principal = await requirePrincipal(request);
    const tenantId = principal;
    const { documentId } = await context.params;
    if (!tableName || !documentId || documentId.includes('/')) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const documentResult = await client.send(new GetCommand({ TableName: tableName, Key: { id: documentId } }));
    if (!documentResult.Item || documentResult.Item.tenantId !== tenantId) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (!confirmationTableName) return NextResponse.json({ error: 'Document confirmations are not configured' }, { status: 503 });
    const body = await request.json() as { corrections?: unknown };
    if (!Array.isArray(body.corrections) || body.corrections.length > 100) return NextResponse.json({ error: 'corrections must be an array of at most 100 items' }, { status: 400 });
    const now = new Date().toISOString();
    let saved = 0;
    for (const correction of body.corrections) {
      if (!correction || typeof correction !== 'object') continue;
      const value = correction as Record<string, unknown>;
      if (typeof value.category !== 'string' || value.category.length === 0 || value.category.length > 80) continue;
      if (typeof value.fieldPath !== 'string' || value.fieldPath.length === 0 || value.fieldPath.length > 160) continue;
      if (!('confirmedValue' in value)) continue;
      const correctionType = typeof value.correctionType === 'string' && value.correctionType.length <= 80
        ? value.correctionType
        : 'MERCHANT_CORRECTION';
      const reason = typeof value.reason === 'string' ? value.reason.slice(0, 500) : undefined;
      const asOf = typeof value.asOf === 'string' ? value.asOf : now.slice(0, 10);
      await client.send(new PutCommand({
        TableName: confirmationTableName,
        Item: {
          id: `${documentId}:${value.category}:${value.fieldPath}:${now}:${saved}`,
          tenantId,
          documentId,
          category: value.category,
          fieldPath: value.fieldPath,
          extractedValue: value.extractedValue,
          confirmedValue: value.confirmedValue,
          correctionType,
          reason,
          asOf,
          confirmedBy: tenantId,
          confirmedAt: now,
          __typename: 'MerchantFieldConfirmation',
        },
      }));
      saved += 1;
    }
    return NextResponse.json({ documentId, saved });
  } catch (error) {
    console.error('Failed to save document corrections', error);
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthenticationConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: 'Failed to save document corrections' }, { status: 500 });
  }
}
