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

type IngestionDocumentBase = {
  id: string;
  tenantId: string;
  fileName: string;
  s3Key: string;
  fileType: string;
  documentType: string;
  status: string;
  extractedEntityCount: number;
  processedAt: string;
  createdAt: string;
  reconciliationStatus: string;
  rawMetadata?: any;
};

export type BankStatementDoc = IngestionDocumentBase & {
  documentType: 'BANK_STATEMENT';
  bankName: string;
  accountNumberMasked: string;
  statementPeriod: { startDate: string; endDate: string };
  openingBalance: number;
  closingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  transactionCount: number;
};

export type BillInvoiceDoc = IngestionDocumentBase & {
  documentType: 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'VENDOR_BILL' | 'OTHER';
  invoiceNumber: string;
  counterpartyName: string;
  counterpartyType: 'CUSTOMER' | 'VENDOR' | 'TAX_AUTHORITY';
  category: 'VENDOR_BILL' | 'CUSTOMER_INVOICE' | 'UTILITY_BILL' | 'STATUTORY_TAX' | string;
  gstin?: string;
  amount: number;
  taxAmount?: number;
  invoiceDate: string;
  dueDate?: string;
  matchedBankRef?: string;
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
const obTableName = process.env.OBLIGATION_TABLE_NAME || outputs.custom?.obligationTableName;
const region = process.env.AWS_REGION
  || outputs.data?.aws_region
  || outputs.auth?.aws_region
  || outputs.custom?.awsRegion
import { getAwsClientConfig } from '@/lib/aws-client-config';

const client = DynamoDBDocumentClient.from(new DynamoDBClient(getAwsClientConfig(region)), {
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
    let tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';
    try {
      tenantId = await requirePrincipal(request);
    } catch (authErr) {
      if (authErr instanceof AuthenticationError) return NextResponse.json({ error: authErr.message }, { status: 401 });
      if (authErr instanceof AuthenticationConfigurationError) return NextResponse.json({ error: authErr.message }, { status: 503 });
      // In development fallback to default tenant
    }

    let rawDbItems: Record<string, any>[] = [];
    let rawObligations: Record<string, any>[] = [];

    if (tableName) {
      try {
        let exclusiveStartKey: Record<string, unknown> | undefined;
        do {
          const response = await client.send(new ScanCommand({
            TableName: tableName,
            FilterExpression: 'tenantId = :tenantId AND (attribute_not_exists(documentType) OR documentType <> :snapshot)',
            ExpressionAttributeValues: { ':tenantId': tenantId, ':snapshot': 'DASHBOARD_SNAPSHOT' },
            ExclusiveStartKey: exclusiveStartKey,
          }));
          rawDbItems.push(...((response.Items || []) as Record<string, any>[]));
          exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
        } while (exclusiveStartKey);
      } catch (scanErr) {
        console.warn('Could not scan DocumentRecord table in DynamoDB:', scanErr);
      }
    }

    if (obTableName) {
      try {
        const res = await client.send(
          new ScanCommand({
            TableName: obTableName,
            FilterExpression: 'tenantId = :tid',
            ExpressionAttributeValues: { ':tid': tenantId },
          })
        );
        rawObligations = (res.Items || []) as Record<string, any>[];
      } catch (err) {
        console.warn('Could not scan Obligation table in DynamoDB:', err);
      }
    }

    // Index obligations by documentId
    const obligationsByDocId: Record<string, any> = {};
    for (const obl of rawObligations) {
      if (obl.documentId) {
        obligationsByDocId[obl.documentId] = obl;
      }
    }

    // Filter out snapshot items
    const docItems = rawDbItems.filter(
      (item) => item.documentType !== 'DASHBOARD_SNAPSHOT' && !String(item.id || '').startsWith('snapshot#')
    );

    const bankStatements: BankStatementDoc[] = [];
    const billsAndInvoices: BillInvoiceDoc[] = [];

    // Map DynamoDB items into typed structures
    for (const item of docItems) {
      const matchingObl = obligationsByDocId[item.id];
      const meta = parseMetadata(item.rawMetadata);

      if (
        item.documentType === 'BANK_STATEMENT' ||
        String(item.fileName || '').toLowerCase().includes('statement') ||
        String(item.fileName || '').toLowerCase().includes('bank')
      ) {
        const accNum = String(meta.accountNumber || meta.accountNumberMasked || 'Account');
        const maskedAcc = accNum.length > 4 ? `•••${accNum.slice(-4)}` : accNum;

        bankStatements.push({
          id: String(item.id),
          tenantId: String(item.tenantId || tenantId),
          fileName: String(item.fileName || 'bank_statement.pdf'),
          s3Key: String(item.s3Key || ''),
          fileType: String(item.fileType || 'application/pdf'),
          documentType: 'BANK_STATEMENT',
          status: (item.status as any) || 'EXTRACTED',
          extractedEntityCount: Number(item.extractedEntityCount ?? (meta.summary as any)?.transactionCount ?? 0),
          processedAt: String(item.processedAt || item.createdAt || new Date().toISOString()),
          createdAt: String(item.createdAt || new Date().toISOString()),
          bankName: String(meta.bankOrIssuerName || meta.bankName || 'Bank'),
          accountNumberMasked: maskedAcc,
          statementPeriod: {
            startDate: String((meta.statementPeriod as any)?.startDate || ''),
            endDate: String((meta.statementPeriod as any)?.endDate || ''),
          },
          openingBalance: Number(meta.openingBalance ?? 0),
          closingBalance: Number(meta.closingBalance ?? 0),
          totalInflow: Number((meta.summary as any)?.totalInflow ?? 0),
          totalOutflow: Number((meta.summary as any)?.totalOutflow ?? 0),
          transactionCount: Number((meta.summary as any)?.transactionCount ?? (item.extractedEntityCount || 0)),
          reconciliationStatus: 'Matched',
          rawMetadata: meta,
        });
      } else {
        billsAndInvoices.push({
          id: String(item.id),
          tenantId: String(item.tenantId || tenantId),
          fileName: String(item.fileName || 'document.pdf'),
          s3Key: String(item.s3Key || ''),
          fileType: String(item.fileType || 'application/pdf'),
          documentType: (item.documentType as any) || 'INVOICE',
          status: (item.status as any) || 'EXTRACTED',
          extractedEntityCount: Number(item.extractedEntityCount || 1),
          processedAt: String(item.processedAt || item.createdAt || new Date().toISOString()),
          createdAt: String(item.createdAt || new Date().toISOString()),
          invoiceNumber: String(meta.invoiceNumber || matchingObl?.title?.slice(0, 20) || item.id),
          counterpartyName: String(matchingObl?.counterpartyName || meta.counterpartyName || 'Counterparty'),
          counterpartyType:
            matchingObl?.type === 'RECEIVABLE' || meta.type === 'RECEIVABLE' || meta.counterpartyType === 'CUSTOMER'
              ? 'CUSTOMER'
              : matchingObl?.isStatutory
              ? 'TAX_AUTHORITY'
              : (meta.counterpartyType as any) || 'VENDOR',
          category:
            matchingObl?.category ||
            (meta.category as any) ||
            (meta.type === 'RECEIVABLE' ? 'CUSTOMER_INVOICE' : 'VENDOR_BILL'),
          gstin: matchingObl?.statutoryId || (meta.gstin as string | undefined),
          amount: Number(matchingObl?.amount ?? meta.amount ?? 0),
          taxAmount: Number(meta.taxAmount || 0),
          invoiceDate: String(meta.invoiceDate || new Date().toISOString().slice(0, 10)),
          dueDate: matchingObl?.dueDate || (meta.dueDate as string | undefined),
          matchedBankRef: meta.matchedBankRef as string | undefined,
          reconciliationStatus: String(meta.reconciliationStatus || 'EXTRACTED'),
          rawMetadata: meta,
        });
      }
    }

    // Sort descending by processedAt or createdAt
    bankStatements.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));
    billsAndInvoices.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));

    const documents = docItems
      .map(publicDocument)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const statusCounts = documents.reduce<Record<string, number>>((acc, document) => {
      acc.total = (acc.total || 0) + 1;
      const status = String(document.status || 'PENDING');
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { total: 0 });

    return NextResponse.json({
      tenantId,
      bankStatements,
      billsAndInvoices,
      documents,
      counts: {
        ...statusCounts,
        bankStatements: bankStatements.length,
        billsAndInvoices: billsAndInvoices.length,
        totalDocuments: bankStatements.length + billsAndInvoices.length,
      },
    });
  } catch (error) {
    console.error('Failed to load ingestion documents', error);
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof AuthenticationConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: 'Failed to retrieve ingestion documents' }, { status: 500 });
  }
}
