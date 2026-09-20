import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { AuthenticationConfigurationError, AuthenticationError, requirePrincipal } from '@/lib/server-auth';
import { documentExtractionView } from '@/lib/document-presentation';

export const runtime = 'nodejs';

type Outputs = {
  auth?: { aws_region?: string };
  data?: { aws_region?: string };
  custom?: Record<string, string>;
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
const tableName = process.env.DOCUMENT_RECORD_TABLE_NAME || outputs.custom?.documentRecordTableName;
const region = process.env.AWS_REGION
  || outputs.data?.aws_region
  || outputs.auth?.aws_region
  || outputs.custom?.awsRegion
  || 'ap-south-1';
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return {};
}

function publicDocument(item: Record<string, unknown>) {
  const metadata = parseMetadata(item.rawMetadata);
  return {
    id: item.id,
    fileName: item.fileName || 'document.pdf',
    purpose: item.purpose || metadata.purpose || 'SUPPORTING_DOCUMENT',
    category: item.category || metadata.category || 'OTHER',
    detectedCategories: item.detectedCategories || metadata.detectedCategories || [],
    status: item.status || 'PENDING',
    validationStatus: item.validationStatus || metadata.validationStatus || 'PENDING',
    validationIssues: item.validationIssues || metadata.validationIssues || [],
    reportingPeriod: item.reportingPeriod || metadata.reportingPeriod || (item.reportingStartDate || item.reportingEndDate ? { startDate: item.reportingStartDate, endDate: item.reportingEndDate } : null),
    extractedEntityCount: item.extractedEntityCount ?? 0,
    ...documentExtractionView(metadata),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    processedAt: item.processedAt,
    errorMessage: item.errorMessage,
  };
}

export async function GET(request: Request) {
  try {
    const principal = await requirePrincipal(request);
    const tenantId = principal;
    if (!tableName) return NextResponse.json({ documents: [], counts: { total: 0 } });
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await client.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: 'tenantId = :tenantId AND (attribute_not_exists(documentType) OR documentType <> :snapshot)',
        ExpressionAttributeValues: { ':tenantId': tenantId, ':snapshot': 'DASHBOARD_SNAPSHOT' },
        ExclusiveStartKey: exclusiveStartKey,
      }));
      items.push(...((response.Items || []) as Record<string, unknown>[]));
      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
    const documents = items
      .filter((item) => !String(item.id || '').startsWith('snapshot#'))
      .map(publicDocument)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const counts = documents.reduce<Record<string, number>>((acc, document) => {
      acc.total = (acc.total || 0) + 1;
      const status = String(document.status || 'PENDING');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { total: 0 });
    return NextResponse.json({ documents, counts });
  } catch (error) {
    console.error('Failed to load ingestion documents', error);
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthenticationConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: 'Failed to retrieve ingestion documents' }, { status: 500 });
  }
}
