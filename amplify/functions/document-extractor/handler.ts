import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Handler } from 'aws-lambda';
import { extractText, extractTextItems, getDocumentProxy, type StructuredTextItem } from 'unpdf';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_PDF_TEXT_ITEMS = 200_000;
const MAX_PDF_TEXT_CHARS = 2_000_000;
const EXTRACTION_TIMEOUT_MS = 90_000;
const s3Client = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

// Bedrock vision code is intentionally parked in bedrock-vision.ts and is not
// imported or called by this active deterministic ingestion handler.

export type DocumentPurpose =
  | 'BANK_ACTIVITY'
  | 'PRODUCT_SALES'
  | 'CURRENT_INVENTORY'
  | 'PURCHASES_SUPPLIERS'
  | 'OPEN_OBLIGATIONS'
  | 'RECURRING_EXPENSES'
  | 'SUPPORTING_DOCUMENT';
export type DocumentCategory = DocumentPurpose | 'OTHER';
export type IngestionPurpose = 'ONBOARDING_BASELINE' | 'PERIODIC_UPDATE';

export interface Provenance {
  page?: number;
  row?: number;
  sourceText?: string;
}

export interface ExtractedTransaction {
  date?: string;
  description?: string;
  amount?: number;
  type?: 'INFLOW' | 'OUTFLOW';
  paymentMode?: 'UPI' | 'NEFT' | 'IMPS' | 'CARD' | 'CASH' | 'CHEQUE' | 'AUTOPAY' | 'OTHER';
  counterpartyName?: string;
  counterpartyIdentifier?: string;
  referenceNumber?: string;
  balanceAfterTransaction?: number;
  inferredCategory?: 'CUSTOMER_RECEIPT' | 'VENDOR_PAYMENT' | 'STATUTORY_TAX' | 'UTILITY' | 'SALARY' | 'OPERATING_EXPENSE' | 'LOAN_EMI' | 'OTHER';
  statutoryId?: string;
  provenance?: Provenance;
}

export interface ExtractedObligation {
  title?: string;
  counterpartyName?: string;
  statutoryId?: string;
  amount?: number;
  dueDate?: string;
  type?: 'PAYABLE' | 'RECEIVABLE';
  category?: 'GST_PAYMENT' | 'TDS_PAYMENT' | 'VENDOR_BILL' | 'UTILITY_BILL' | 'CUSTOMER_INVOICE' | 'SALARY' | 'OTHER';
  isStatutory?: boolean;
  probability?: number;
  expectedSettlementDate?: string;
  provenance?: Provenance;
}

export interface ExtractedLineItem {
  productName?: string;
  sku?: string;
  category?: string;
  quantity?: number;
  unitOfMeasure?: string;
  unitPrice?: number;
  grossAmount?: number;
  discountAmount?: number;
  taxAmount?: number;
  netAmount?: number;
  provenance?: Provenance;
}

export interface ExtractedSupplierTerms {
  supplierName?: string;
  leadTimeDays?: number;
  creditPeriodDays?: number;
  minimumOrderQuantity?: number;
  deliveryCost?: number;
  paymentTermsText?: string;
  provenance?: Provenance;
}

export interface ExtractedInvoiceDetails {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  partyType?: 'SUPPLIER' | 'CUSTOMER';
  partyName?: string;
  partyGstin?: string;
  totalAmount?: number;
  discountAmount?: number;
  netSalesAmount?: number;
  provenance?: Provenance;
}

export interface ExtractedInventoryItem {
  productName?: string;
  sku?: string;
  quantityOnHand?: number;
  unitOfMeasure?: string;
  unitPurchaseCost?: number;
  inventoryValue?: number;
  provenance?: Provenance;
}

export interface ExtractedRecurringExpense {
  expenseType?: string;
  amount?: number;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  dueDayOfMonth?: number;
  counterpartyName?: string;
  provenance?: Provenance;
}

export interface RawExtractionResult {
  documentType: 'BANK_STATEMENT' | 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'SALES' | 'INVENTORY' | 'PURCHASES' | 'OBLIGATIONS' | 'RECURRING_EXPENSES' | 'OTHER';
  category?: DocumentCategory;
  bankOrIssuerName?: string;
  accountNumber?: string;
  statementPeriod?: { startDate?: string; endDate?: string };
  reportingCoverage?: { startDate?: string; endDate?: string; days?: number };
  openingBalance?: number;
  closingBalance?: number;
  statutoryIdentifiers?: { gstin?: string; pan?: string };
  transactions: ExtractedTransaction[];
  obligations: ExtractedObligation[];
  lineItems?: ExtractedLineItem[];
  inventoryItems?: ExtractedInventoryItem[];
  recurringExpenses?: ExtractedRecurringExpense[];
  supplierTerms?: ExtractedSupplierTerms;
  invoiceDetails?: ExtractedInvoiceDetails;
  currency?: string;
  confidenceScore?: number;
  validationIssues?: string[];
}

export interface ExtractionInput {
  bucket?: string;
  key?: string;
  s3Key?: string;
  s3Bucket?: string;
  tenantId?: string;
  documentId?: string;
  purpose?: IngestionPurpose;
  category?: DocumentCategory;
  detail?: { bucket?: { name?: string }; object?: { key?: string } };
}

interface DocumentRecordManifest {
  id?: string;
  tenantId?: string;
  s3Key?: string;
  purpose?: IngestionPurpose;
  category?: DocumentCategory;
}

interface SourceLine {
  text: string;
  provenance: Provenance;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Local PDF extraction timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseS3Event(event: ExtractionInput) {
  const bucket = event.bucket || event.s3Bucket || event.detail?.bucket?.name || '';
  let key = event.key || event.s3Key || event.detail?.object?.key || '';
  if (key) key = decodeURIComponent(key.replace(/\+/g, ' '));
  if (!bucket || !key) throw new Error('Missing S3 bucket or key in extraction event');
  const parts = key.split('/');
  if (parts[0] !== 'tenants' || !parts[1] || parts[2] !== 'documents' || !parts[3]) {
    throw new Error('S3 object key must use tenants/{sub}/documents/{documentId}/{fileName}');
  }
  const tenantId = parts[1];
  const documentId = parts[3];
  if (event.tenantId && event.tenantId !== tenantId) throw new Error('Tenant does not match S3 object prefix');
  if (event.documentId && event.documentId !== documentId) throw new Error('Document does not match S3 object prefix');
  if (!documentId) throw new Error('Missing document id');
  return { bucket, key, tenantId, documentId };
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[,₹]/g, '').replace(/\b(?:INR|Rs\.?)\b/gi, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
}

function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = value.trim();
  const iso = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return undefined;
}

function firstAmount(text: string, labels: RegExp): number | undefined {
  const match = text.match(labels);
  return match ? numberValue(match[1]) : undefined;
}

function firstDate(text: string, labels: RegExp): string | undefined {
  const match = text.match(labels);
  return match ? isoDate(match[1]) : undefined;
}

function dateRange(text: string): { startDate?: string; endDate?: string } | undefined {
  const match = text.match(/(?:statement|reporting|period|from)\s*(?:period|date)?\s*[:#-]?\s*(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})\s*(?:to|[-–])\s*(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})/i);
  if (!match) return undefined;
  const startDate = isoDate(match[1]); const endDate = isoDate(match[2]);
  return startDate || endDate ? { startDate, endDate } : undefined;
}

function lineProvenance(line: string, index: number, sourceLines?: SourceLine[]): Provenance {
  const source = sourceLines?.[index]?.provenance;
  return { ...source, row: source?.row || index + 1, sourceText: source?.sourceText || line };
}

const COMMON_PRODUCT_NAMES = ['Cotton Bedsheet', 'Ceramic Dinner Set', 'Bamboo Storage Basket', 'Table Runner'];
const PRODUCT_SKU_PATTERN = /\b[A-Z]{2,10}-\d{2,}\b/;
const PRODUCT_ROW_TAIL_PATTERN = /^(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z .-]{0,20})\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)(?:\s+.*)?$/;

function productNameFromPrefix(prefix: string): string {
  const knownProduct = COMMON_PRODUCT_NAMES.find((name) => prefix.toLowerCase().includes(name.toLowerCase()));
  if (knownProduct) return knownProduct;
  return prefix
    .replace(/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\s+/, '')
    .replace(/^[A-Z0-9]+(?:-[A-Z0-9]+){2,}\s+/i, '')
    .trim();
}

/**
 * Parse the tabular rows produced by the synthetic sales, purchase, and
 * inventory PDFs. The SKU is a stable anchor; parsing from the right-hand
 * numeric columns avoids mistaking dates, invoice numbers, or years in the
 * description for the quantity.
 */
function parseLineItems(lines: string[], sourceLines?: SourceLine[]): ExtractedLineItem[] {
  const items: ExtractedLineItem[] = [];
  lines.forEach((line, index) => {
    const normalizedLine = line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
    const skuMatch = normalizedLine.match(PRODUCT_SKU_PATTERN);
    if (!skuMatch || skuMatch.index === undefined) return;
    const tail = normalizedLine.slice(skuMatch.index + skuMatch[0].length).trim();
    const match = tail.match(PRODUCT_ROW_TAIL_PATTERN);
    if (!match) return;
    const quantity = numberValue(match[1]);
    const unitPrice = numberValue(match[3]);
    const grossAmount = numberValue(match[4]);
    const productName = productNameFromPrefix(normalizedLine.slice(0, skuMatch.index).trim());
    if (!productName || quantity === undefined || unitPrice === undefined || grossAmount === undefined) return;
    items.push({
      productName,
      sku: skuMatch[0],
      quantity,
      unitOfMeasure: match[2].trim().toLowerCase() || 'unit',
      unitPrice,
      grossAmount,
      netAmount: grossAmount,
      provenance: lineProvenance(line, index, sourceLines),
    });
  });
  return items;
}

/** Deterministic local extraction. It is conservative by design and never uses OCR or a remote model. */
export function extractFromDocumentText(text: string, hint?: { purpose?: DocumentPurpose; category?: DocumentCategory }, sourceLines?: SourceLine[]): RawExtractionResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const joined = lines.join('\n');
  const gstin = joined.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i)?.[1]?.toUpperCase();
  const pan = joined.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/i)?.[1]?.toUpperCase();
  const range = dateRange(joined);
  const result: RawExtractionResult = {
    documentType: 'OTHER', category: hint?.category || hint?.purpose, transactions: [], obligations: [], currency: 'INR',
    statutoryIdentifiers: gstin || pan ? { gstin, pan: gstin ? gstin.slice(2, 12) : pan } : undefined,
    reportingCoverage: range,
    validationIssues: [],
  };
  const bank = /bank\s*statement|statement\s*of\s*account|opening\s*balance|closing\s*balance/i.test(joined) || hint?.purpose === 'BANK_ACTIVITY';
  if (bank) {
    result.documentType = 'BANK_STATEMENT';
    result.category = hint?.category || 'BANK_ACTIVITY';
    result.bankOrIssuerName = joined.match(/\b(HDFC\s+Bank|ICICI\s+Bank|Axis\s+Bank|Kotak(?:\s+Mahindra)?\s+Bank|State\s+Bank\s+of\s+India)\b/i)?.[1];
    result.accountNumber = joined.match(/account\s*(?:number|no\.?)\s*[:#-]?\s*(\d{6,18})/i)?.[1];
    result.statementPeriod = range;
    result.openingBalance = firstAmount(joined, /opening\s+balance[^\d\n]*([\d,]+(?:\.\d{1,2})?)/i);
    result.closingBalance = firstAmount(joined, /closing\s+balance[^\d\n]*([\d,]+(?:\.\d{1,2})?)/i);
    const rowPattern = /^(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\s+(.+)$/;
    const markedRowPattern = /^(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\s+(.+?)\s+([\d,]+(?:\.\d{1,2})?)\s+(DR|CR)\s+([\d,]+(?:\.\d{1,2})?)$/i;
    result.transactions = lines.flatMap((line, index) => {
      const marked = line.match(markedRowPattern);
      if (marked) {
        const date = isoDate(marked[1]);
        const amount = numberValue(marked[3]);
        const balanceAfterTransaction = numberValue(marked[5]);
        if (!date || amount === undefined) return [];
        const description = marked[2].trim();
        const type = marked[4].toUpperCase() === 'DR' ? 'OUTFLOW' : 'INFLOW';
        const category = /gst|tds|tax|epf|esic/i.test(description) ? 'STATUTORY_TAX' : /salary|payroll/i.test(description) ? 'SALARY' : /electric|water|power|utility/i.test(description) ? 'UTILITY' : type === 'INFLOW' ? 'CUSTOMER_RECEIPT' : type === 'OUTFLOW' ? 'OPERATING_EXPENSE' : undefined;
        return [{ date, description, amount, type, inferredCategory: category as ExtractedTransaction['inferredCategory'], balanceAfterTransaction, paymentMode: /upi/i.test(description) ? 'UPI' : /neft/i.test(description) ? 'NEFT' : /imps/i.test(description) ? 'IMPS' : undefined, referenceNumber: description.match(/\b\d{10,16}\b/)?.[0], provenance: lineProvenance(line, index, sourceLines) }];
      }
      const match = line.match(rowPattern); if (!match) return [];
      const amounts = match[2].match(/[\d,]+(?:\.\d{1,2})?/g) || [];
      const amount = numberValue(amounts[0]); if (amount === undefined) return [];
      const balanceAfterTransaction = amounts.length > 1 ? numberValue(amounts[amounts.length - 1]) : undefined;
      const description = match[2].replace(/[\d,]+(?:\.\d{1,2})?/g, ' ').replace(/\s+/g, ' ').trim();
      const debit = /\b(?:DR|DEBIT|WITHDRAW|PAYMENT|PURCHASE)\b/i.test(description);
      const credit = /\b(?:CR|CREDIT|DEPOSIT|RECEIPT)\b/i.test(description);
      const type = debit ? 'OUTFLOW' : credit ? 'INFLOW' : undefined;
      const category = /gst|tds|tax|epf|esic/i.test(description) ? 'STATUTORY_TAX' : /salary|payroll/i.test(description) ? 'SALARY' : /electric|water|power|utility/i.test(description) ? 'UTILITY' : type === 'INFLOW' ? 'CUSTOMER_RECEIPT' : type === 'OUTFLOW' ? 'OPERATING_EXPENSE' : undefined;
      return [{ date: isoDate(match[1]), description, amount, type, inferredCategory: category as ExtractedTransaction['inferredCategory'], balanceAfterTransaction, paymentMode: /upi/i.test(description) ? 'UPI' : /neft/i.test(description) ? 'NEFT' : /imps/i.test(description) ? 'IMPS' : undefined, referenceNumber: description.match(/\b\d{10,16}\b/)?.[0], provenance: lineProvenance(line, index, sourceLines) }];
    });
    if (!result.transactions.length && !result.openingBalance && !result.closingBalance) result.validationIssues?.push('NO_BANK_FACTS_EXTRACTED');
    return result;
  }

  const inventory = hint?.purpose === 'CURRENT_INVENTORY' || /inventory|stock\s*statement|quantity\s*on\s*hand/i.test(joined);
  if (inventory) {
    result.documentType = 'INVENTORY'; result.category = hint?.category || 'CURRENT_INVENTORY';
    result.inventoryItems = parseLineItems(lines, sourceLines).map((item) => ({ productName: item.productName, quantityOnHand: item.quantity, unitOfMeasure: item.unitOfMeasure, unitPurchaseCost: item.unitPrice, inventoryValue: item.grossAmount, provenance: item.provenance }));
    return result;
  }

  const recurring = hint?.purpose === 'RECURRING_EXPENSES' || /recurring|monthly\s+(?:rent|expense|salary)|utility\s+bill|payroll/i.test(joined);
  const amount = firstAmount(joined, /(?:total\s+amount|invoice\s+amount|amount\s+due|payable|rent\s+due|monthly\s+expense)[^\d\n]*([\d,]+(?:\.\d{1,2})?)/i);
  const dueDate = firstDate(joined, /(?:due\s+date|payment\s+due)[^\d\n]*(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})/i);
  const lineItems = parseLineItems(lines, sourceLines);
  const firstDataLine = lines.find((line) => {
    const normalizedLine = line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
    const skuMatch = normalizedLine.match(PRODUCT_SKU_PATTERN);
    return skuMatch?.index !== undefined && PRODUCT_ROW_TAIL_PATTERN.test(normalizedLine.slice(skuMatch.index + skuMatch[0].length).trim());
  });
  const rowDate = firstDataLine?.match(/^(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s+/)?.[1];
  const rowInvoiceNumber = firstDataLine?.replace(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s+/, '').trim().split(/\s+/)[0];
  const invoiceNumber = joined.match(/invoice\s*(?:number|no\.?|#)\s*[:#-]\s*([A-Za-z0-9-]+)/i)?.[1] || rowInvoiceNumber;
  const invoiceDate = firstDate(joined, /invoice\s+date[^\d\n]*(\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4})/i) || isoDate(rowDate);
  const lineItemTotal = lineItems.reduce((sum, item) => sum + (item.netAmount ?? item.grossAmount ?? 0), 0) || undefined;
  const partyName = joined.match(/(?:customer|buyer|supplier|vendor|landlord|provider)\s*[:#-]\s*([^\n,]+)/i)?.[1]?.trim();
  if (hint?.purpose === 'PRODUCT_SALES' || /sales\s+report|sales\s+invoice|customer\s+invoice/i.test(joined)) {
    const totalAmount = amount ?? lineItemTotal;
    result.documentType = 'SALES'; result.category = hint?.category || 'PRODUCT_SALES'; result.lineItems = lineItems; result.invoiceDetails = { invoiceNumber, invoiceDate, totalAmount, netSalesAmount: totalAmount, partyType: 'CUSTOMER', partyName }; return result;
  }
  if (hint?.purpose === 'PURCHASES_SUPPLIERS' || /vendor\s+bill|purchase\s+invoice|tax\s+invoice|supplier/i.test(joined)) {
    const totalAmount = amount ?? lineItemTotal;
    result.documentType = 'PURCHASES'; result.category = hint?.category || 'PURCHASES_SUPPLIERS'; result.lineItems = lineItems; result.invoiceDetails = { invoiceNumber, invoiceDate, dueDate, totalAmount, partyType: 'SUPPLIER', partyName }; if (totalAmount !== undefined) result.obligations = [{ title: result.invoiceDetails.invoiceNumber ? `Invoice ${result.invoiceDetails.invoiceNumber}` : undefined, counterpartyName: partyName, amount: totalAmount, dueDate, type: 'PAYABLE', category: 'VENDOR_BILL', provenance: { sourceText: joined.slice(0, 500) } }]; return result;
  }
  if (recurring) {
    result.documentType = 'RECURRING_EXPENSES'; result.category = hint?.category || 'RECURRING_EXPENSES'; result.recurringExpenses = amount !== undefined ? [{ amount, frequency: /weekly/i.test(joined) ? 'WEEKLY' : /quarter/i.test(joined) ? 'QUARTERLY' : 'MONTHLY', expenseType: /rent/i.test(joined) ? 'RENT' : /salary|payroll/i.test(joined) ? 'PAYROLL' : /utility|electric|water/i.test(joined) ? 'UTILITY' : undefined, counterpartyName: joined.match(/(?:landlord|provider|supplier)\s*[:#-]?\s*([^\n,]+)/i)?.[1]?.trim(), provenance: { sourceText: joined.slice(0, 500) } }] : []; return result;
  }
  if (/gst|tds|tax\s+challan|payable|receivable|obligation/i.test(joined) && amount !== undefined) { result.documentType = 'OBLIGATIONS'; result.category = hint?.category || 'OPEN_OBLIGATIONS'; result.obligations = [{ title: joined.match(/(?:description|particulars|obligation)\s*[:#-]?\s*([^\n]+)/i)?.[1]?.trim(), amount, dueDate, type: /receivable/i.test(joined) ? 'RECEIVABLE' : 'PAYABLE', category: /gst/i.test(joined) ? 'GST_PAYMENT' : /tds/i.test(joined) ? 'TDS_PAYMENT' : 'OTHER', isStatutory: /gst|tds|tax/i.test(joined), provenance: { sourceText: joined.slice(0, 500) } }]; return result; }
  result.validationIssues?.push('UNRECOGNIZED_DOCUMENT');
  return result;
}

function itemLines(items: StructuredTextItem[]): string[] {
  const lines: string[] = [];
  let parts: string[] = [];
  let baseline: number | undefined;
  const flush = () => {
    const line = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
    parts = [];
    baseline = undefined;
  };
  for (const item of items) {
    const value = item.str.trim();
    if (!value) continue;
    const tolerance = Math.max(2, item.height * 0.5);
    if (baseline !== undefined && Math.abs(item.y - baseline) > tolerance) flush();
    if (baseline === undefined) baseline = item.y;
    parts.push(value);
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

async function resolveDocumentManifest(tenantId: string, documentId: string, key: string): Promise<DocumentRecordManifest> {
  const tableName = process.env.DOCUMENT_RECORD_TABLE_NAME;
  if (!tableName) throw new Error('Document manifest table is not configured');
  const result = await dynamo.send(new GetCommand({ TableName: tableName, Key: { id: documentId }, ConsistentRead: true }));
  const manifest = result.Item as DocumentRecordManifest | undefined;
  if (!manifest) throw new Error('Pending document manifest was not found');
  if (manifest.id && manifest.id !== documentId) throw new Error('Document manifest id does not match the event');
  if (manifest.tenantId !== tenantId) throw new Error('Document manifest tenant does not match the S3 object prefix');
  if (manifest.s3Key !== key) throw new Error('Document manifest key does not match the S3 object key');
  return manifest;
}

export const handler: Handler = async (event: ExtractionInput) => {
  const { bucket, key, tenantId, documentId } = parseS3Event(event);
  if (!key.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF objects are accepted');
  const manifest = await resolveDocumentManifest(tenantId, documentId, key);
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error('The PDF object has no body');
  const bytes = new Uint8Array(await response.Body.transformToByteArray());
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES || Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') throw new Error('The S3 object is not a valid PDF under the 10 MB limit');
  const hint = {
    purpose: manifest.category && manifest.category !== 'OTHER' ? manifest.category : undefined,
    category: manifest.category,
  };
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(bytes);
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) throw new Error('The PDF has no pages');
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`The PDF exceeds the ${MAX_PDF_PAGES}-page limit`);

    const [textResult, itemResult] = await withTimeout(
      Promise.all([
        extractText(pdf, { mergePages: false }),
        extractTextItems(pdf),
      ]),
      EXTRACTION_TIMEOUT_MS,
    );
    const itemCount = itemResult.items.reduce((count, page) => count + page.length, 0);
    if (itemCount > MAX_PDF_TEXT_ITEMS) throw new Error(`The PDF exceeds the ${MAX_PDF_TEXT_ITEMS}-text-item limit`);

    const pageTexts = Array.isArray(textResult.text) ? textResult.text.map((page) => String(page || '')) : [String(textResult.text || '')];
    const text = pageTexts.join('\n');
    if (text.length > MAX_PDF_TEXT_CHARS) throw new Error(`The PDF exceeds the ${MAX_PDF_TEXT_CHARS}-character text limit`);
    const sourceLines: SourceLine[] = pageTexts.flatMap((pageText, pageIndex) => pageText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, rowIndex) => ({ text: line, provenance: { page: pageIndex + 1, row: rowIndex + 1, sourceText: line } })));
    const structuredLines = itemResult.items.flatMap((items, pageIndex) => itemLines(items).map((line, rowIndex) => ({ text: line, provenance: { page: pageIndex + 1, row: rowIndex + 1, sourceText: line } })));
    const usableText = text.trim() ? text : structuredLines.map((line) => line.text).join('\n');
    const usableSourceLines = text.trim() ? sourceLines : structuredLines;
    const extracted = usableText.trim()
      ? extractFromDocumentText(usableText, hint, usableSourceLines)
      : {
          documentType: 'OTHER' as const,
          category: hint.category,
          transactions: [],
          obligations: [],
          currency: 'INR',
          validationIssues: ['SCANNED_PDF_NO_TEXT_OCR_UNAVAILABLE'],
        };
    return { statusCode: 200, bucket, key, tenantId, documentId, purpose: manifest.purpose, category: manifest.category, extractor: 'unpdf-local', rawExtraction: extracted, extractedAt: new Date().toISOString() };
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> } | undefined)?.destroy?.();
  }
};
