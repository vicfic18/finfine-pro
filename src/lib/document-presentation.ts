export type DocumentRecord = Record<string, unknown>;

export type DocumentExtractionView = {
  extractedFields: DocumentRecord;
  extractionSummary: Record<string, number>;
  extractedData: {
    transactions: DocumentRecord[];
    obligations: DocumentRecord[];
    lineItems: DocumentRecord[];
    inventoryItems: DocumentRecord[];
    recurringExpenses: DocumentRecord[];
    invoiceDetails?: DocumentRecord;
    supplierTerms?: DocumentRecord;
  };
};

function asRecord(value: unknown): DocumentRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as DocumentRecord
    : {};
}

function records(value: unknown, limit = 50): DocumentRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is DocumentRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .slice(0, limit);
}

function nonEmptyRecord(value: unknown): DocumentRecord | undefined {
  const record = asRecord(value);
  return Object.keys(record).length ? record : undefined;
}

export function documentExtractionView(rawMetadata: unknown): DocumentExtractionView {
  const metadata = asRecord(rawMetadata);
  const raw = asRecord(metadata.rawExtraction);
  const existingFields = asRecord(metadata.extractedFields);
  const summary = Object.fromEntries(
    Object.entries(asRecord(metadata.summary))
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([key, value]) => [key, value as number]),
  );
  const extractedData = {
    transactions: records(raw.transactions),
    obligations: records(raw.obligations),
    lineItems: records(raw.lineItems),
    inventoryItems: records(raw.inventoryItems),
    recurringExpenses: records(raw.recurringExpenses),
    invoiceDetails: nonEmptyRecord(raw.invoiceDetails),
    supplierTerms: nonEmptyRecord(raw.supplierTerms),
  };

  const countFallbacks: Record<string, keyof typeof extractedData> = {
    transactionCount: 'transactions',
    obligationCount: 'obligations',
    productCount: 'lineItems',
    purchaseCount: 'lineItems',
    saleCount: 'lineItems',
    inventoryCount: 'inventoryItems',
    recurringExpenseCount: 'recurringExpenses',
  };
  for (const [summaryKey, dataKey] of Object.entries(countFallbacks)) {
    if (summary[summaryKey] === undefined) {
      const value = extractedData[dataKey];
      summary[summaryKey] = Array.isArray(value) ? value.length : 0;
    }
  }

  const invoice = asRecord(raw.invoiceDetails);
  const extractedFields: DocumentRecord = {
    ...existingFields,
    documentType: raw.documentType,
    bankOrIssuerName: raw.bankOrIssuerName,
    accountNumber: raw.accountNumber,
    invoiceNumber: invoice.invoiceNumber,
    partyName: invoice.partyName,
    totalAmount: invoice.totalAmount,
    openingBalance: raw.openingBalance,
    closingBalance: raw.closingBalance,
  };

  return {
    extractedFields: Object.fromEntries(
      Object.entries(extractedFields).filter(([, value]) => value !== undefined && value !== null),
    ),
    extractionSummary: summary,
    extractedData,
  };
}
