import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';
const docTableName = process.env.DOCUMENT_RECORD_TABLE_NAME || 'DocumentRecord-ifsueqzwybf6nau7duulv5qweq-NONE';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export interface BankStatementDoc {
  id: string;
  tenantId: string;
  fileName: string;
  s3Key: string;
  fileType: string;
  documentType: 'BANK_STATEMENT';
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED';
  extractedEntityCount: number;
  processedAt: string;
  createdAt: string;
  bankName: string;
  accountNumberMasked: string;
  statementPeriod: {
    startDate: string;
    endDate: string;
  };
  openingBalance: number;
  closingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  transactionCount: number;
  reconciliationStatus: string;
  rawMetadata?: any;
}

export interface BillInvoiceDoc {
  id: string;
  tenantId: string;
  fileName: string;
  s3Key: string;
  fileType: string;
  documentType: 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'VENDOR_BILL';
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED';
  extractedEntityCount: number;
  processedAt: string;
  createdAt: string;
  invoiceNumber: string;
  counterpartyName: string;
  counterpartyType: 'CUSTOMER' | 'VENDOR' | 'TAX_AUTHORITY';
  category: 'VENDOR_BILL' | 'CUSTOMER_INVOICE' | 'UTILITY_BILL' | 'STATUTORY_TAX';
  gstin?: string;
  amount: number;
  taxAmount?: number;
  invoiceDate: string;
  dueDate?: string;
  matchedBankRef?: string;
  reconciliationStatus: string;
  rawMetadata?: any;
}

const obTableName = process.env.OBLIGATION_TABLE_NAME || 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';

export async function GET() {
  try {
    let rawDbItems: any[] = [];
    let rawObligations: any[] = [];

    if (docTableName) {
      try {
        const res = await docClient.send(
          new ScanCommand({
            TableName: docTableName,
            FilterExpression: 'tenantId = :tid',
            ExpressionAttributeValues: { ':tid': tenantId },
          })
        );
        rawDbItems = res.Items || [];
      } catch (err) {
        console.warn('Could not scan DocumentRecord table in DynamoDB:', err);
      }
    }

    if (obTableName) {
      try {
        const res = await docClient.send(
          new ScanCommand({
            TableName: obTableName,
            FilterExpression: 'tenantId = :tid',
            ExpressionAttributeValues: { ':tid': tenantId },
          })
        );
        rawObligations = res.Items || [];
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
      (item) => item.documentType !== 'DASHBOARD_SNAPSHOT' && !item.id?.startsWith('snapshot#')
    );

    const bankStatements: BankStatementDoc[] = [];
    const billsAndInvoices: BillInvoiceDoc[] = [];

    // Map DynamoDB items into typed structures
    for (const item of docItems) {
      const matchingObl = obligationsByDocId[item.id];
      let meta: any = {};
      if (item.rawMetadata) {
        try {
          meta = typeof item.rawMetadata === 'string' ? JSON.parse(item.rawMetadata) : item.rawMetadata;
        } catch {
          meta = {};
        }
      }

      if (
        item.documentType === 'BANK_STATEMENT' ||
        item.fileName?.toLowerCase().includes('statement') ||
        item.fileName?.toLowerCase().includes('bank')
      ) {
        const accNum = meta.accountNumber || meta.accountNumberMasked || 'Account';
        const maskedAcc = accNum.length > 4 ? `•••${accNum.slice(-4)}` : accNum;

        bankStatements.push({
          id: item.id,
          tenantId: item.tenantId || tenantId,
          fileName: item.fileName || 'bank_statement.pdf',
          s3Key: item.s3Key || '',
          fileType: item.fileType || 'application/pdf',
          documentType: 'BANK_STATEMENT',
          status: (item.status as any) || 'EXTRACTED',
          extractedEntityCount: item.extractedEntityCount ?? (meta.summary?.transactionCount || 0),
          processedAt: item.processedAt || item.createdAt || new Date().toISOString(),
          createdAt: item.createdAt || new Date().toISOString(),
          bankName: meta.bankOrIssuerName || meta.bankName || 'Bank',
          accountNumberMasked: maskedAcc,
          statementPeriod: {
            startDate: meta.statementPeriod?.startDate || '',
            endDate: meta.statementPeriod?.endDate || '',
          },
          openingBalance: meta.openingBalance ?? 0,
          closingBalance: meta.closingBalance ?? 0,
          totalInflow: meta.summary?.totalInflow ?? 0,
          totalOutflow: meta.summary?.totalOutflow ?? 0,
          transactionCount: meta.summary?.transactionCount ?? (item.extractedEntityCount || 0),
          reconciliationStatus: 'Matched',
          rawMetadata: meta,
        });
      } else {
        // Invoice / Bill / Receipt / Tax Challan
        billsAndInvoices.push({
          id: item.id,
          tenantId: item.tenantId || tenantId,
          fileName: item.fileName || 'document.pdf',
          s3Key: item.s3Key || '',
          fileType: item.fileType || 'application/pdf',
          documentType: (item.documentType as any) || 'INVOICE',
          status: (item.status as any) || 'EXTRACTED',
          extractedEntityCount: item.extractedEntityCount || 1,
          processedAt: item.processedAt || item.createdAt || new Date().toISOString(),
          createdAt: item.createdAt || new Date().toISOString(),
          invoiceNumber: meta.invoiceNumber || matchingObl?.title?.slice(0, 20) || item.id,
          counterpartyName: matchingObl?.counterpartyName || meta.counterpartyName || 'Counterparty',
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
          gstin: matchingObl?.statutoryId || meta.gstin,
          amount: Number(matchingObl?.amount ?? meta.amount ?? 0),
          taxAmount: Number(meta.taxAmount || 0),
          invoiceDate: meta.invoiceDate || new Date().toISOString().slice(0, 10),
          dueDate: matchingObl?.dueDate || meta.dueDate,
          matchedBankRef: meta.matchedBankRef,
          reconciliationStatus: meta.reconciliationStatus || 'EXTRACTED',
          rawMetadata: meta,
        });
      }
    }

    // Sort descending by processedAt or createdAt
    bankStatements.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));
    billsAndInvoices.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));

    return NextResponse.json({
      tenantId,
      bankStatements,
      billsAndInvoices,
      counts: {
        bankStatements: bankStatements.length,
        billsAndInvoices: billsAndInvoices.length,
        totalDocuments: bankStatements.length + billsAndInvoices.length,
      },
    });
  } catch (err: any) {
    console.error('Error loading ingestion documents:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve ingestion documents', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
