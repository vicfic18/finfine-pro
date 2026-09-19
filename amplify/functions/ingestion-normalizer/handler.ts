import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Handler } from 'aws-lambda';
import { randomUUID } from 'crypto';

const dynamoDbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoDbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Priority weights (w_i^type) mapping for deterministic optimization engine
const CATEGORY_PRIORITY_WEIGHTS: Record<string, number> = {
  STATUTORY_TAX: 1.0, // Non-negotiable legal obligation
  GST_PAYMENT: 1.0,
  TDS_PAYMENT: 1.0,
  UTILITY: 0.85, // Essential for operational business continuity
  UTILITY_BILL: 0.85,
  SALARY: 0.8, // Crucial employee retention & operations
  LOAN_EMI: 0.75, // Credit rating preservation
  VENDOR_PAYMENT: 0.7, // Supplier relationships & supply continuity
  VENDOR_BILL: 0.7,
  CUSTOMER_RECEIPT: 0.6, // Inflow reconciliation
  CUSTOMER_INVOICE: 0.6,
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
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

  const refMatch = text.match(/\b\d{12}\b/);
  if (refMatch) {
    refNumber = refMatch[0];
  }

  if (!upiVpa) {
    const vpaMatch = text.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/);
    if (vpaMatch) {
      upiVpa = vpaMatch[1];
    }
  }

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

  // Resolve Canonical DynamoDB Table Names
  const docTableName = process.env.DOCUMENT_RECORD_TABLE_NAME;
  const txnTableName = process.env.TRANSACTION_TABLE_NAME;
  const oblTableName = process.env.OBLIGATION_TABLE_NAME;
  const prodTableName = process.env.PRODUCT_TABLE_NAME;
  const purchaseTableName = process.env.PURCHASE_TABLE_NAME;
  const purchaseLineItemTableName = process.env.PURCHASE_LINE_ITEM_TABLE_NAME;
  const saleTableName = process.env.SALE_TABLE_NAME;
  const saleLineItemTableName = process.env.SALE_LINE_ITEM_TABLE_NAME;
  const cashPositionTableName = process.env.CASH_POSITION_TABLE_NAME;
  const supplierProfileTableName = process.env.SUPPLIER_PROFILE_TABLE_NAME;
  const supplierProductTermsTableName = process.env.SUPPLIER_PRODUCT_TERMS_TABLE_NAME;

  console.log(
    `Target Tables: DocumentRecord=${docTableName}, Transaction=${txnTableName}, Obligation=${oblTableName}, Product=${prodTableName}, CashSnapshot=${cashPositionTableName}, Purchase=${purchaseTableName}`
  );

  const rawGstin = rawExtraction.statutoryIdentifiers?.gstin || '';
  const rawPan = rawExtraction.statutoryIdentifiers?.pan || '';
  const validatedIds = validateStatutoryId(rawGstin || rawPan);

  const rawTransactions = Array.isArray(rawExtraction.transactions) ? rawExtraction.transactions : [];
  const rawObligations = Array.isArray(rawExtraction.obligations) ? rawExtraction.obligations : [];
  const rawLineItems = Array.isArray(rawExtraction.lineItems) ? rawExtraction.lineItems : [];
  const rawSupplierTerms = rawExtraction.supplierTerms || null;
  const rawInvoiceDetails = rawExtraction.invoiceDetails || null;

  const nowIso = new Date().toISOString();
  let totalInflow = 0;
  let totalOutflow = 0;

  // 1. Process & Normalize Transactions
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

  // 2. Normalize Supplier Profile and Products if Line Items or Invoice Details exist
  let supplierId: string | null = null;
  let primaryProductId: string | null = null;
  const createdProducts: any[] = [];
  const createdPurchases: any[] = [];
  const createdPurchaseLineItems: any[] = [];
  const createdSales: any[] = [];
  const createdSaleLineItems: any[] = [];

  const partyName =
    rawInvoiceDetails?.partyName ||
    rawSupplierTerms?.supplierName ||
    (rawExtraction.documentType === 'INVOICE' && rawExtraction.bankOrIssuerName ? rawExtraction.bankOrIssuerName : null);

  const partyType = rawInvoiceDetails?.partyType || (rawExtraction.documentType === 'INVOICE' ? 'SUPPLIER' : null);

  if (partyName && partyType === 'SUPPLIER' && supplierProfileTableName) {
    supplierId = `sup-${tenantId}-${partyName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;
    const supplierItem = {
      id: supplierId,
      tenantId,
      supplierName: partyName,
      leadTimeDays: rawSupplierTerms?.leadTimeDays ?? 3,
      creditPeriodDays: rawSupplierTerms?.creditPeriodDays ?? 30,
      minimumOrderQuantity: rawSupplierTerms?.minimumOrderQuantity ?? 1,
      deliveryCost: rawSupplierTerms?.deliveryCost ?? 0,
      paymentTermsText: rawSupplierTerms?.paymentTermsText ?? 'Net 30',
      reliabilityScore: 0.95,
      notes: `Extracted from document ${documentId}`,
      createdAt: nowIso,
      updatedAt: nowIso,
      __typename: 'SupplierProfile',
    };

    try {
      console.log(`Writing SupplierProfile: ${supplierId}...`);
      await docClient.send(
        new PutCommand({
          TableName: supplierProfileTableName,
          Item: supplierItem,
        })
      );
    } catch (supErr) {
      console.warn(`Could not save SupplierProfile: ${supErr}`);
    }
  }

  // Upsert Products from line items
  if (rawLineItems.length > 0 && prodTableName) {
    for (const item of rawLineItems) {
      const prodName = item.productName || 'General Item';
      const cleanProdId = `prod-${tenantId}-${prodName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;
      if (!primaryProductId) primaryProductId = cleanProdId;

      const productItem = {
        id: cleanProdId,
        tenantId,
        name: prodName,
        sku: item.sku || `SKU-${prodName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`,
        category: item.category || 'INVENTORY',
        unitOfMeasure: item.unitOfMeasure || 'unit',
        isActive: true,
        aliases: [prodName],
        createdAt: nowIso,
        updatedAt: nowIso,
        __typename: 'Product',
      };
      createdProducts.push(productItem);

      try {
        await docClient.send(
          new PutCommand({
            TableName: prodTableName,
            Item: productItem,
          })
        );
      } catch (prodErr) {
        console.warn(`Could not save Product ${cleanProdId}:`, prodErr);
      }
    }
  }

  // 3. Process & Normalize Obligations
  const primaryObligationId = randomUUID();
  const normalizedObligations = rawObligations.map((obl: any, idx: number) => {
    const amount = normalizeAmount(obl.amount);
    const category = obl.category || (rawExtraction.documentType === 'INVOICE' ? 'VENDOR_BILL' : 'OTHER');
    const isStatutory = obl.isStatutory ?? (category.startsWith('GST') || category.startsWith('TDS'));
    const priorityWeight = isStatutory ? 1.0 : (CATEGORY_PRIORITY_WEIGHTS[category] ?? 0.7);

    return {
      id: idx === 0 ? primaryObligationId : randomUUID(),
      tenantId,
      documentId,
      title: obl.title || (partyName ? `Invoice from ${partyName}` : 'Upcoming Financial Obligation'),
      counterpartyName: obl.counterpartyName || partyName || 'Counterparty',
      statutoryId: obl.statutoryId || (isStatutory ? validatedIds.gstin || validatedIds.pan : null),
      amount,
      dueDate: normalizeDate(obl.dueDate || rawInvoiceDetails?.dueDate),
      type: obl.type === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE',
      category,
      priorityWeight,
      penaltyRatePerDay: obl.penaltyRatePerDay || (isStatutory ? 0.0005 : 0.0002),
      isStatutory,
      status: 'SCHEDULED',
      supplierId: supplierId || null,
      productId: primaryProductId || null,
      allowPartialPayment: true,
      expectedSettlementDate: normalizeDate(obl.dueDate || rawInvoiceDetails?.dueDate),
      probability: 0.95,
      confidence: 'HIGH',
      sourceRecordIds: [documentId],
      createdAt: nowIso,
      updatedAt: nowIso,
      __typename: 'Obligation',
    };
  });

  // 4. Create Purchase & PurchaseLineItems (or Sales)
  if (partyType === 'SUPPLIER' && (rawLineItems.length > 0 || rawInvoiceDetails) && purchaseTableName) {
    const purchaseId = `pur-${randomUUID()}`;
    const totalAmount =
      rawInvoiceDetails?.totalAmount != null
        ? normalizeAmount(rawInvoiceDetails.totalAmount)
        : rawLineItems.reduce((acc: number, l: any) => acc + (normalizeAmount(l.netAmount) || normalizeAmount(l.grossAmount)), 0);

    const purchaseItem = {
      id: purchaseId,
      tenantId,
      purchaseDate: normalizeDate(rawInvoiceDetails?.invoiceDate),
      supplierId: supplierId || null,
      supplierName: partyName || 'Supplier',
      totalAmount,
      documentId,
      obligationId: primaryObligationId,
      sourceRecordIds: [documentId],
      createdAt: nowIso,
      updatedAt: nowIso,
      __typename: 'Purchase',
    };
    createdPurchases.push(purchaseItem);

    try {
      console.log(`Writing Purchase: ${purchaseId}...`);
      await docClient.send(
        new PutCommand({
          TableName: purchaseTableName,
          Item: purchaseItem,
        })
      );
    } catch (purErr) {
      console.warn('Could not save Purchase:', purErr);
    }

    if (purchaseLineItemTableName && rawLineItems.length > 0) {
      for (const item of rawLineItems) {
        const prodName = item.productName || 'General Item';
        const cleanProdId = `prod-${tenantId}-${prodName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;
        const lineItem = {
          id: randomUUID(),
          tenantId,
          purchaseId,
          productId: cleanProdId,
          quantity: item.quantity || 1,
          unitPurchaseCost: normalizeAmount(item.unitPrice),
          totalPurchaseAmount: normalizeAmount(item.netAmount || item.grossAmount || (item.quantity * item.unitPrice)),
          createdAt: nowIso,
          updatedAt: nowIso,
          __typename: 'PurchaseLineItem',
        };
        createdPurchaseLineItems.push(lineItem);

        try {
          await docClient.send(
            new PutCommand({
              TableName: purchaseLineItemTableName,
              Item: lineItem,
            })
          );
        } catch (pliErr) {
          console.warn('Could not save PurchaseLineItem:', pliErr);
        }
      }
    }
  }

  // 5. Persist CashPositionSnapshot if opening/closing balance is present
  let cashSnapshotSaved = false;
  const rawClosing = rawExtraction.closingBalance != null ? normalizeAmount(rawExtraction.closingBalance) : null;
  const rawOpening = rawExtraction.openingBalance != null ? normalizeAmount(rawExtraction.openingBalance) : null;
  const effectiveCash = rawClosing ?? rawOpening;

  if (effectiveCash != null && cashPositionTableName) {
    const snapshotDate = normalizeDate(rawExtraction.statementPeriod?.endDate || rawExtraction.statementPeriod?.startDate);
    const cashSnapshotItem = {
      id: `snap-${tenantId}-${snapshotDate}`,
      tenantId,
      asOf: snapshotDate,
      bankBalance: effectiveCash,
      cashOnHand: 0,
      totalLiquidCash: effectiveCash,
      sourceDocumentIds: [documentId],
      createdAt: nowIso,
      updatedAt: nowIso,
      __typename: 'CashPositionSnapshot',
    };

    try {
      console.log(`Writing CashPositionSnapshot for tenant ${tenantId} as of ${snapshotDate}...`);
      await docClient.send(
        new PutCommand({
          TableName: cashPositionTableName,
          Item: cashSnapshotItem,
        })
      );
      cashSnapshotSaved = true;
    } catch (cashErr) {
      console.warn('Could not write CashPositionSnapshot:', cashErr);
    }
  }

  // 6. Persist Document Record
  const totalExtractedCount =
    normalizedTransactions.length +
    normalizedObligations.length +
    createdProducts.length +
    createdPurchases.length;

  const documentRecordItem = {
    id: documentId,
    tenantId,
    fileName: key.split('/').pop() || 'document.pdf',
    s3Key: key,
    fileType: key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
    documentType: rawExtraction.documentType || 'BANK_STATEMENT',
    status: 'EXTRACTED',
    extractedEntityCount: totalExtractedCount,
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
        productCount: createdProducts.length,
        purchaseCount: createdPurchases.length,
        cashSnapshotSaved,
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

  // 7. Batch Write Transactions (chunks of 25 for DynamoDB limit)
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

  // 8. Batch Write Obligations if any
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

  // 9. Update tenant's extraction summary anchor in DynamoDB DocumentRecord table
  if (docTableName && tenantId) {
    try {
      const summaryId = `latest-extraction#${tenantId}`;
      const statutorySum = normalizedObligations
        .filter((o: any) => o.isStatutory)
        .reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
      const currentLiquidBalance = effectiveCash ?? Math.max(0, totalInflow - totalOutflow);
      const spendable = Math.max(0, currentLiquidBalance - statutorySum);

      await docClient.send(
        new PutCommand({
          TableName: docTableName,
          Item: {
            id: summaryId,
            tenantId,
            documentType: 'DASHBOARD_SNAPSHOT',
            status: 'COMPLETED',
            s3Key: key,
            fileName: `dashboard-snapshot-${tenantId}.json`,
            rawMetadata: JSON.stringify({
              asOfDate: normalizeDate(rawExtraction.statementPeriod?.endDate || rawExtraction.statementPeriod?.startDate),
              totalLiquidBalance: currentLiquidBalance,
              spendableLiquidity: spendable,
              statutoryLockbox: statutorySum,
              statutoryBreakdown: {
                gst: normalizedObligations.filter((o: any) => o.category === 'GST_PAYMENT').reduce((sum: number, o: any) => sum + o.amount, 0),
                tds: normalizedObligations.filter((o: any) => o.category === 'TDS_PAYMENT').reduce((sum: number, o: any) => sum + o.amount, 0),
                pfEsic: normalizedObligations.filter((o: any) => o.title?.includes('EPFO') || o.title?.includes('ESIC')).reduce((sum: number, o: any) => sum + o.amount, 0),
                advanceTax: 0,
              },
              inflowsNext15Days: Math.round(totalInflow * 100) / 100,
              commitmentsNext15Days: Math.round(totalOutflow * 100) / 100,
              latestDocumentId: documentId,
              extractedEntityCount: totalExtractedCount,
              processedAt: nowIso,
            }),
            processedAt: nowIso,
            updatedAt: nowIso,
            createdAt: nowIso,
            __typename: 'DocumentRecord',
          },
        })
      );
    } catch (snapshotErr) {
      console.warn('Non-fatal: Could not write dashboard snapshot record:', snapshotErr);
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
      productCount: createdProducts.length,
      purchaseCount: createdPurchases.length,
      cashSnapshotSaved,
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      openingBalance: rawExtraction.openingBalance ?? null,
      closingBalance: rawExtraction.closingBalance ?? null,
    },
    normalizedTransactions,
    normalizedObligations,
    createdProducts,
    createdPurchases,
    processedAt: nowIso,
  };
};
