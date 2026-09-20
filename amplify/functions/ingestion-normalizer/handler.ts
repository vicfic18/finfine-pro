import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Handler } from 'aws-lambda';
import { randomUUID } from 'crypto';
import type { RawExtractionResult } from '../document-extractor/handler';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const PRIORITY: Record<string, number> = { STATUTORY_TAX: 1, GST_PAYMENT: 1, TDS_PAYMENT: 1, SALARY: 0.9, UTILITY: 0.85, UTILITY_BILL: 0.85, VENDOR_PAYMENT: 0.7, VENDOR_BILL: 0.7, CUSTOMER_RECEIPT: 0.65, CUSTOMER_INVOICE: 0.6, OTHER: 0.4 };
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

export function normalizeDate(raw?: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw.trim();
  const iso = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return undefined;
}

export function normalizeAmount(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[,₹]/g, '').replace(/\b(?:INR|Rs\.?)\b/gi, '').trim()) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : undefined;
}

function idParts(id?: string | null) {
  if (!id) return {};
  const clean = id.trim().toUpperCase();
  if (GSTIN.test(clean)) return { gstin: clean, pan: clean.slice(2, 12) };
  if (PAN.test(clean)) return { pan: clean };
  return {};
}

function dateRange(raw: RawExtractionResult) {
  const startDate = normalizeDate(raw.reportingCoverage?.startDate || raw.statementPeriod?.startDate);
  const endDate = normalizeDate(raw.reportingCoverage?.endDate || raw.statementPeriod?.endDate);
  return startDate || endDate ? { startDate, endDate } : undefined;
}

function daysBetween(start?: string, end?: string) {
  if (!start || !end) return undefined;
  const startMs = Date.parse(`${start}T00:00:00Z`); const endMs = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? Math.round((endMs - startMs) / 86400000) + 1 : undefined;
}

function addIssue(issues: string[], issue: string) { if (!issues.includes(issue)) issues.push(issue); }

export function validateExtraction(raw: RawExtractionResult, category?: string): string[] {
  const issues = [...(Array.isArray(raw.validationIssues) ? raw.validationIssues : [])];
  if (raw.currency && raw.currency.toUpperCase() !== 'INR') addIssue(issues, 'CURRENCY_NOT_INR');
  const period = dateRange(raw);
  const requiresPeriod = ['BANK_ACTIVITY', 'PRODUCT_SALES', 'PURCHASES_SUPPLIERS'].includes(category || raw.category || '');
  if (requiresPeriod && !period?.startDate) addIssue(issues, 'MISSING_REPORTING_PERIOD');
  if (period?.startDate && period.endDate) {
    if (period.startDate > period.endDate) addIssue(issues, 'REPORTING_PERIOD_INVALID');
    const days = daysBetween(period.startDate, period.endDate);
    if (days !== undefined && days < 90) addIssue(issues, 'REPORTING_PERIOD_SHORT_OF_90_DAYS');
  }
  const ids = new Set<string>();
  for (const tx of raw.transactions || []) {
    if (tx.amount !== undefined && normalizeAmount(tx.amount) === undefined) addIssue(issues, 'INVALID_TRANSACTION_AMOUNT');
    if (!normalizeDate(tx.date)) addIssue(issues, 'TRANSACTION_DATE_UNRESOLVED');
    if (tx.referenceNumber) { if (ids.has(tx.referenceNumber)) addIssue(issues, 'DUPLICATE_SOURCE_ID'); ids.add(tx.referenceNumber); }
  }
  for (const obligation of raw.obligations || []) {
    if (obligation.amount !== undefined && normalizeAmount(obligation.amount) === undefined) addIssue(issues, 'INVALID_OBLIGATION_AMOUNT');
    if (obligation.dueDate && !normalizeDate(obligation.dueDate)) addIssue(issues, 'OBLIGATION_DATE_UNRESOLVED');
    if (obligation.type && !['PAYABLE', 'RECEIVABLE'].includes(obligation.type)) addIssue(issues, 'OBLIGATION_DIRECTION_INVALID');
  }
  for (const item of raw.lineItems || []) {
    if (!item.productName) addIssue(issues, 'PRODUCT_IDENTITY_MISSING');
    if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity < 0)) addIssue(issues, 'INVALID_UNIT_QUANTITY');
    if (item.grossAmount !== undefined && item.quantity !== undefined && item.unitPrice !== undefined) {
      const expected = item.quantity * item.unitPrice;
      if (Math.abs(expected - item.grossAmount) > Math.max(1, expected * 0.02)) addIssue(issues, 'LINE_TOTAL_MISMATCH');
    }
  }
  if (raw.openingBalance !== undefined && raw.closingBalance !== undefined) {
    const opening = normalizeAmount(raw.openingBalance); const closing = normalizeAmount(raw.closingBalance);
    const inflow = (raw.transactions || []).filter((tx) => tx.type === 'INFLOW').reduce((sum, tx) => sum + (normalizeAmount(tx.amount) || 0), 0);
    const outflow = (raw.transactions || []).filter((tx) => tx.type === 'OUTFLOW').reduce((sum, tx) => sum + (normalizeAmount(tx.amount) || 0), 0);
    if (opening !== undefined && closing !== undefined && Math.abs(opening + inflow - outflow - closing) > 1) addIssue(issues, 'BALANCE_RECONCILIATION_FAILED');
  }
  return issues;
}

function table(name: string) { return process.env[name]; }

type NormalizerEvent = {
  tenantId?: unknown;
  documentId?: unknown;
  bucket?: unknown;
  key?: unknown;
  category?: unknown;
  purpose?: unknown;
  extractor?: unknown;
  rawExtraction?: unknown;
};

async function batchWrite(tableName: string | undefined, items: Record<string, unknown>[]) {
  if (!tableName || !items.length) return;
  for (let index = 0; index < items.length; index += 25) {
    await dynamo.send(new BatchWriteCommand({ RequestItems: { [tableName]: items.slice(index, index + 25).map((Item) => ({ PutRequest: { Item } })) } }));
  }
}

export const handler: Handler = async (event: NormalizerEvent) => {
  const tenantId = typeof event.tenantId === 'string' ? event.tenantId : '';
  const documentId = typeof event.documentId === 'string' ? event.documentId : '';
  const bucket = typeof event.bucket === 'string' ? event.bucket : '';
  const key = typeof event.key === 'string' ? event.key : '';
  if (!tenantId || !documentId || !key || !key.startsWith(`tenants/${tenantId}/documents/${documentId}/`)) throw new Error('Normalizer requires a tenant-scoped document event');
  const raw = event.rawExtraction as RawExtractionResult;
  if (!raw || !Array.isArray(raw.transactions) || !Array.isArray(raw.obligations)) throw new Error('Extraction payload is missing required arrays');
  const now = new Date().toISOString();
  const category = typeof event.category === 'string' ? event.category : raw.category;
  const issues = validateExtraction(raw, category);
  const ids = idParts(raw.statutoryIdentifiers?.gstin || raw.statutoryIdentifiers?.pan);
  const period = dateRange(raw);
  const transactionItems = raw.transactions.flatMap((tx) => {
    const amount = normalizeAmount(tx.amount); const date = normalizeDate(tx.date);
    if (amount === undefined || !date || !tx.type) return [];
    return [{ id: randomUUID(), tenantId, documentId, date, amount, type: tx.type, paymentMode: tx.paymentMode, counterpartyName: tx.counterpartyName, counterpartyIdentifier: tx.counterpartyIdentifier, category: tx.inferredCategory, statutoryId: idParts(tx.statutoryId || ids.gstin || ids.pan).gstin || idParts(tx.statutoryId || ids.gstin || ids.pan).pan, balanceAfterTransaction: normalizeAmount(tx.balanceAfterTransaction), referenceNumber: tx.referenceNumber, description: tx.description, status: 'CONFIRMED', sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'Transaction' }];
  });
  const party = raw.invoiceDetails?.partyName || raw.supplierTerms?.supplierName;
  const supplierId = party && raw.invoiceDetails?.partyType === 'SUPPLIER' ? `sup-${tenantId}-${party.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}` : undefined;
  const productIds = new Map<string, string>();
  const products = (raw.lineItems || []).flatMap((item) => {
    if (!item.productName) return [];
    const productId = `prod-${tenantId}-${item.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    productIds.set(item.productName, productId);
    return [{ id: productId, tenantId, name: item.productName, sku: item.sku, category: item.category, unitOfMeasure: item.unitOfMeasure, isActive: true, aliases: [item.productName], sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'Product' }];
  });
  const obligations = raw.obligations.flatMap((obligation) => {
    const amount = normalizeAmount(obligation.amount); if (amount === undefined || !obligation.type) return [];
    return [{ id: randomUUID(), tenantId, documentId, title: obligation.title, counterpartyName: obligation.counterpartyName || party, statutoryId: idParts(obligation.statutoryId || ids.gstin || ids.pan).gstin || idParts(obligation.statutoryId || ids.gstin || ids.pan).pan, amount, dueDate: normalizeDate(obligation.dueDate), type: obligation.type, category: obligation.category, priorityWeight: obligation.category ? PRIORITY[obligation.category] : undefined, isStatutory: obligation.isStatutory, status: 'SCHEDULED', expectedSettlementDate: normalizeDate(obligation.expectedSettlementDate), probability: typeof obligation.probability === 'number' ? obligation.probability : undefined, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'Obligation' }];
  });
  const supplier = supplierId && party ? [{ id: supplierId, tenantId, supplierName: party, leadTimeDays: raw.supplierTerms?.leadTimeDays, creditPeriodDays: raw.supplierTerms?.creditPeriodDays, minimumOrderQuantity: raw.supplierTerms?.minimumOrderQuantity, deliveryCost: normalizeAmount(raw.supplierTerms?.deliveryCost), paymentTermsText: raw.supplierTerms?.paymentTermsText, notes: `Extracted from ${documentId}`, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'SupplierProfile' }] : [];
  const purchaseId = raw.invoiceDetails?.partyType === 'SUPPLIER' && (raw.invoiceDetails.totalAmount !== undefined || raw.lineItems?.length) ? `pur-${randomUUID()}` : undefined;
  const purchases = purchaseId ? [{ id: purchaseId, tenantId, purchaseDate: normalizeDate(raw.invoiceDetails?.invoiceDate), supplierId, supplierName: party, totalAmount: normalizeAmount(raw.invoiceDetails?.totalAmount), documentId, obligationId: obligations[0]?.id, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'Purchase' }] : [];
  const purchaseLines = purchaseId ? (raw.lineItems || []).flatMap((item) => { const quantity = typeof item.quantity === 'number' ? item.quantity : undefined; const unit = normalizeAmount(item.unitPrice); const total = normalizeAmount(item.netAmount ?? item.grossAmount); if (!quantity || unit === undefined || total === undefined || !item.productName) return []; return [{ id: randomUUID(), tenantId, purchaseId, productId: productIds.get(item.productName), quantity, unitPurchaseCost: unit, totalPurchaseAmount: total, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'PurchaseLineItem' }]; }) : [];
  const sales = raw.invoiceDetails?.partyType === 'CUSTOMER' && normalizeAmount(raw.invoiceDetails.totalAmount) !== undefined ? [{ id: `sale-${randomUUID()}`, tenantId, saleDate: normalizeDate(raw.invoiceDetails.invoiceDate), customerName: raw.invoiceDetails.partyName, grossAmount: normalizeAmount(raw.invoiceDetails.totalAmount), netSalesAmount: normalizeAmount(raw.invoiceDetails.netSalesAmount ?? raw.invoiceDetails.totalAmount), documentId, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'Sale' }] : [];
  const inventorySnapshot = raw.inventoryItems?.length ? [{ id: `inventory-${randomUUID()}`, tenantId, snapshotDate: normalizeDate(period?.endDate || raw.invoiceDetails?.invoiceDate), sourceType: 'DOCUMENT', documentId, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'InventorySnapshot' }] : [];
  const inventoryItems = inventorySnapshot.length ? (raw.inventoryItems || []).flatMap((item) => { if (!item.productName || typeof item.quantityOnHand !== 'number') return []; const productId = productIds.get(item.productName) || `prod-${tenantId}-${item.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`; return [{ id: randomUUID(), tenantId, inventorySnapshotId: inventorySnapshot[0].id, productId, quantityOnHand: item.quantityOnHand, unitPurchaseCost: normalizeAmount(item.unitPurchaseCost), inventoryValue: normalizeAmount(item.inventoryValue), sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'InventoryItem' }]; }) : [];
  const recurring = (raw.recurringExpenses || []).flatMap((item) => { const amount = normalizeAmount(item.amount); if (amount === undefined || !item.frequency) return []; return [{ id: randomUUID(), tenantId, expenseType: item.expenseType, amount, frequency: item.frequency, dueDayOfMonth: item.dueDayOfMonth, isActive: true, notes: item.counterpartyName, sourceRecordIds: [documentId], createdAt: now, updatedAt: now, __typename: 'RecurringExpense' }]; });
  const closingBalance = normalizeAmount(raw.closingBalance);
  const cashSnapshot = raw.documentType === 'BANK_STATEMENT' && closingBalance !== undefined && period?.endDate && issues.length === 0
    ? [{ id: `cash-${tenantId}-${documentId}`, tenantId, asOf: period.endDate, bankBalance: closingBalance, totalLiquidCash: closingBalance, sourceDocumentIds: [documentId], createdAt: now, updatedAt: now, __typename: 'CashPositionSnapshot' }]
    : [];
  const rawMetadata = { rawExtraction: raw, closingBalance, statementPeriod: period, extractedFields: { bankOrIssuerName: raw.bankOrIssuerName, accountNumber: raw.accountNumber, invoiceNumber: raw.invoiceDetails?.invoiceNumber, statutoryIdentifiers: ids }, validationStatus: issues.length ? 'NEEDS_REVIEW' : 'VALID', validationIssues: issues, extractor: event.extractor, summary: { transactionCount: transactionItems.length, obligationCount: obligations.length, productCount: products.length, purchaseCount: purchases.length, saleCount: sales.length, inventoryCount: inventoryItems.length, recurringExpenseCount: recurring.length, cashSnapshotCount: cashSnapshot.length } };
  const document = { id: documentId, tenantId, fileName: key.split('/').pop() || 'document.pdf', s3Key: key, fileType: 'application/pdf', documentType: raw.documentType, purpose: event.purpose, category: category || 'OTHER', detectedCategories: [category || 'OTHER'], reportingPeriod: period, reportingStartDate: period?.startDate, reportingEndDate: period?.endDate, status: 'EXTRACTED', validationStatus: issues.length ? 'NEEDS_REVIEW' : 'VALID', validationIssues: issues, extractedEntityCount: transactionItems.length + obligations.length + products.length + purchases.length + sales.length + inventoryItems.length + recurring.length, rawMetadata, processedAt: now, createdAt: now, updatedAt: now, __typename: 'DocumentRecord' };
  await Promise.all([
    table('DOCUMENT_RECORD_TABLE_NAME') ? dynamo.send(new PutCommand({ TableName: table('DOCUMENT_RECORD_TABLE_NAME'), Item: document })) : Promise.resolve(),
    batchWrite(table('TRANSACTION_TABLE_NAME'), transactionItems), batchWrite(table('OBLIGATION_TABLE_NAME'), obligations), batchWrite(table('PRODUCT_TABLE_NAME'), products), batchWrite(table('SUPPLIER_PROFILE_TABLE_NAME'), supplier), batchWrite(table('PURCHASE_TABLE_NAME'), purchases), batchWrite(table('PURCHASE_LINE_ITEM_TABLE_NAME'), purchaseLines), batchWrite(table('SALE_TABLE_NAME'), sales), batchWrite(table('CASH_POSITION_TABLE_NAME'), cashSnapshot), batchWrite(table('INVENTORY_SNAPSHOT_TABLE_NAME'), inventorySnapshot), batchWrite(table('INVENTORY_ITEM_TABLE_NAME'), inventoryItems), batchWrite(table('RECURRING_EXPENSE_TABLE_NAME'), recurring),
  ]);
  return { statusCode: 200, tenantId, documentId, s3Bucket: bucket, s3Key: key, documentType: raw.documentType, status: 'COMPLETED', validationStatus: issues.length ? 'NEEDS_REVIEW' : 'VALID', validationIssues: issues, summary: { transactionCount: transactionItems.length, obligationCount: obligations.length, productCount: products.length, purchaseCount: purchases.length, saleCount: sales.length, inventoryCount: inventoryItems.length, recurringExpenseCount: recurring.length, cashSnapshotCount: cashSnapshot.length }, processedAt: now };
};
