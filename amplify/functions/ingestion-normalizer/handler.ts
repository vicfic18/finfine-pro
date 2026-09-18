import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Handler } from 'aws-lambda';
import { randomUUID } from 'crypto';

const dynamoDbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDbClient);

// Priority weights (w_i^type) mapping for deterministic optimization engine
const CATEGORY_PRIORITY_WEIGHTS: Record<string, number> = {
  STATUTORY_TAX: 1.0, // Non-negotiable legal obligation
  UTILITY: 0.85, // Essential for operational business continuity
  SALARY: 0.8, // Crucial employee retention & operations
  LOAN_EMI: 0.75, // Credit rating preservation
  VENDOR_PAYMENT: 0.7, // Supplier relationships & supply continuity
  CUSTOMER_RECEIPT: 0.6, // Inflow reconciliation
  OPERATING_EXPENSE: 0.5, // General business overheads
  OTHER: 0.3, // Discretionary
};

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;

function normalizeDate(rawDate?: string): string {
  if (!rawDate) {
    return new Date().toISOString().split('T')[0];
  }
  const clean = rawDate.trim();
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  // If DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
  // Try JS Date parsing
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function validateStatutoryId(id?: string | null): { gstin?: string; pan?: string } {
  const result: { gstin?: string; pan?: string } = {};
  if (!id) return result;
  const clean = id.trim().toUpperCase();
  if (GSTIN_REGEX.test(clean)) {
    result.gstin = clean;
    // GSTIN contains PAN as characters 3 to 12
    result.pan = clean.substring(2, 12);
  } else if (PAN_REGEX.test(clean)) {
    result.pan = clean;
  }
  return result;
}

function normalizeAmount(amount: unknown): number {
  if (typeof amount === 'number' && !isNaN(amount)) {
    return Math.round(Math.abs(amount) * 100) / 100;
  }
  if (typeof amount === 'string') {
    const cleanStr = amount.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0.0 : Math.round(Math.abs(num) * 100) / 100;
  }
  return 0.0;
}

function extractUpiDetails(description?: string, rawVpa?: string): {
  isUpi: boolean;
  upiVpa?: string;
  refNumber?: string;
  cleanPartyName?: string;
} {
  let isUpi = false;
  let upiVpa = rawVpa?.trim() || undefined;
  let refNumber: string | undefined = undefined;
  let cleanPartyName: string | undefined = undefined;

  const text = description || '';
  if (/UPI/i.test(text) || (upiVpa && upiVpa.includes('@'))) {
    isUpi = true;
  }

  // Look for 12-digit UTR/RRN
  const refMatch = text.match(/\b\d{12}\b/);
  if (refMatch) {
    refNumber = refMatch[0];
  }

  // Look for VPA pattern if not provided
  if (!upiVpa) {
    const vpaMatch = text.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/);
    if (vpaMatch) {
      upiVpa = vpaMatch[1];
    }
  }

  // If UPI narration is like UPI/CR/12345/Name/Bank or UPI/DR/12345/Name@vpa
  const upiParts = text.split('/');
  if (upiParts.length >= 4) {
    cleanPartyName = upiParts[3].replace(/@.*/, '').replace(/_/g, ' ').trim();
  }

  return { isUpi, upiVpa, refNumber, cleanPartyName };
}

export const handler: Handler = async (event) => {
  console.log('Ingestion Normalizer received payload:', JSON.stringify(event, null, 2));

  const bucket = event.bucket || '';
  const key = event.key || '';
  const tenantId = event.tenantId || 'default-tenant';
  const documentId = event.documentId || `doc-${Date.now()}`;
  const rawExtraction = event.rawExtraction || {};

  const docTableName = process.env.DOCUMENT_RECORD_TABLE_NAME;
  const txnTableName = process.env.TRANSACTION_TABLE_NAME;
  const oblTableName = process.env.OBLIGATION_TABLE_NAME;

  console.log(`Target Tables: DocumentRecord=${docTableName}, Transaction=${txnTableName}, Obligation=${oblTableName}`);

  const rawGstin = rawExtraction.statutoryIdentifiers?.gstin || '';
  const rawPan = rawExtraction.statutoryIdentifiers?.pan || '';
  const validatedIds = validateStatutoryId(rawGstin || rawPan);

  const rawTransactions = Array.isArray(rawExtraction.transactions) ? rawExtraction.transactions : [];
  const rawObligations = Array.isArray(rawExtraction.obligations) ? rawExtraction.obligations : [];

  const nowIso = new Date().toISOString();
  let totalInflow = 0;
  let totalOutflow = 0;

  // Process & Normalize Transactions
  const normalizedTransactions = rawTransactions.map((tx: any) => {
    const amount = normalizeAmount(tx.amount);
    const type: 'INFLOW' | 'OUTFLOW' = tx.type === 'INFLOW' ? 'INFLOW' : 'OUTFLOW';
    if (type === 'INFLOW') totalInflow += amount;
    else totalOutflow += amount;

    const upiInfo = extractUpiDetails(tx.description, tx.counterpartyIdentifier);
    const category = tx.inferredCategory || (type === 'INFLOW' ? 'CUSTOMER_RECEIPT' : 'OPERATING_EXPENSE');
    const priorityWeight = CATEGORY_PRIORITY_WEIGHTS[category] ?? 0.5;

    const statutory = validateStatutoryId(tx.statutoryId || validatedIds.gstin || validatedIds.pan);

    return {
      id: randomUUID(),
      tenantId,
      documentId,
      date: normalizeDate(tx.date),
      amount,
      type,
      paymentMode: tx.paymentMode || (upiInfo.isUpi ? 'UPI' : 'OTHER'),
      counterpartyName: tx.counterpartyName || upiInfo.cleanPartyName || 'Unknown Counterparty',
      counterpartyIdentifier: tx.counterpartyIdentifier || upiInfo.upiVpa || null,
      category,
      statutoryId: statutory.gstin || statutory.pan || null,
      priorityWeight,
      balanceAfterTransaction: tx.balanceAfterTransaction != null ? normalizeAmount(tx.balanceAfterTransaction) : null,
      referenceNumber: tx.referenceNumber || upiInfo.refNumber || null,
      description: tx.description || `${type} via ${tx.paymentMode || 'Payment'}`,
      status: 'CONFIRMED',
      createdAt: nowIso,
      updatedAt: nowIso,
      __typename: 'Transaction',
    };
  });

  // Process & Normalize Obligations
  const normalizedObligations = rawObligations.map((obl: any) => {
    const amount = normalizeAmount(obl.amount);
    const category = obl.category || 'VENDOR_BILL';
    const isStatutory = obl.isStatutory ?? (category.startsWith('GST') || category.startsWith('TDS'));
    const priorityWeight = isStatutory ? 1.0 : (CATEGORY_PRIORITY_WEIGHTS[category] ?? 0.7);

    return {
      id: randomUUID(),
      tenantId,
      documentId,
      title: obl.title || 'Upcoming Financial Obligation',
      counterpartyName: obl.counterpartyName || 'Counterparty',
      statutoryId: obl.statutoryId || (isStatutory ? validatedIds.gstin || validatedIds.pan : null),
      amount,
      dueDate: normalizeDate(obl.dueDate),
      type: obl.type === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE',
      category,
      priorityWeight,
      penaltyRatePerDay: obl.penaltyRatePerDay || (isStatutory ? 0.0005 : 0.0002), // e.g. 18% per annum statutory
      isStatutory,
      status: 'SCHEDULED',
      createdAt: nowIso,
      updatedAt: nowIso,
      __typename: 'Obligation',
    };
  });

  // Persist Document Record
  const documentRecordItem = {
    id: documentId,
    tenantId,
    fileName: key.split('/').pop() || 'document.pdf',
    s3Key: key,
    fileType: key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    documentType: rawExtraction.documentType || 'BANK_STATEMENT',
    status: 'EXTRACTED',
    extractedEntityCount: normalizedTransactions.length + normalizedObligations.length,
    rawMetadata: JSON.stringify({
      bankOrIssuerName: rawExtraction.bankOrIssuerName,
      accountNumber: rawExtraction.accountNumber,
      statementPeriod: rawExtraction.statementPeriod,
      openingBalance: rawExtraction.openingBalance,
      closingBalance: rawExtraction.closingBalance,
      statutoryIdentifiers: validatedIds,
      modelUsed: event.modelUsed,
      summary: {
        totalInflow: Math.round(totalInflow * 100) / 100,
        totalOutflow: Math.round(totalOutflow * 100) / 100,
        transactionCount: normalizedTransactions.length,
        obligationCount: normalizedObligations.length,
      },
    }),
    processedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    __typename: 'DocumentRecord',
  };

  if (docTableName) {
    console.log(`Writing DocumentRecord ${documentId} to DynamoDB...`);
    await docClient.send(
      new PutCommand({
        TableName: docTableName,
        Item: documentRecordItem,
      })
    );
  }

  // Batch Write Transactions (chunks of 25 for DynamoDB limit)
  if (txnTableName && normalizedTransactions.length > 0) {
    console.log(`Writing ${normalizedTransactions.length} Transactions to DynamoDB in batches...`);
    for (let i = 0; i < normalizedTransactions.length; i += 25) {
      const batch = normalizedTransactions.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [txnTableName]: batch.map((item: Record<string, any>) => ({
              PutRequest: { Item: item },
            })),
          },
        })
      );
    }
  }

  // Batch Write Obligations if any
  if (oblTableName && normalizedObligations.length > 0) {
    console.log(`Writing ${normalizedObligations.length} Obligations to DynamoDB in batches...`);
    for (let i = 0; i < normalizedObligations.length; i += 25) {
      const batch = normalizedObligations.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [oblTableName]: batch.map((item: Record<string, any>) => ({
              PutRequest: { Item: item },
            })),
          },
        })
      );
    }
  }

  console.log('Ingestion and Normalization completed successfully!');

  return {
    statusCode: 200,
    tenantId,
    documentId,
    s3Bucket: bucket,
    s3Key: key,
    documentType: documentRecordItem.documentType,
    status: 'COMPLETED',
    statutoryIdentifiers: validatedIds,
    summary: {
      transactionCount: normalizedTransactions.length,
      obligationCount: normalizedObligations.length,
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      openingBalance: rawExtraction.openingBalance ?? null,
      closingBalance: rawExtraction.closingBalance ?? null,
    },
    normalizedTransactions,
    normalizedObligations,
    processedAt: nowIso,
  };
};
