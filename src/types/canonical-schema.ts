/**
 * FinFine Pro — Canonical Data Schemas for Analytics Skills
 *
 * Implements canonical entities and business state as specified in DATA_SCHEMA_CHANGES_REQUIRED.md.
 * Persists factual merchant state while derived calculations remain analytical outputs.
 */

// ============================================================================
// 1. Transaction & Obligation Enums & Mappings
// ============================================================================

export type TransactionCategory =
  | 'CUSTOMER_RECEIPT'
  | 'VENDOR_PAYMENT'
  | 'STATUTORY_TAX'
  | 'UTILITY'
  | 'SALARY'
  | 'OPERATING_EXPENSE'
  | 'LOAN_EMI'
  | 'OTHER';

export type ObligationCategory =
  | 'GST_PAYMENT'
  | 'TDS_PAYMENT'
  | 'VENDOR_BILL'
  | 'UTILITY_BILL'
  | 'SALARY'
  | 'CUSTOMER_INVOICE'
  | 'OTHER';

export type PaymentMode =
  | 'UPI'
  | 'NEFT'
  | 'IMPS'
  | 'CARD'
  | 'CASH'
  | 'CHEQUE'
  | 'AUTOPAY'
  | 'OTHER';

export type ObligationType = 'PAYABLE' | 'RECEIVABLE';

export type ObligationStatus = 'SCHEDULED' | 'PAID' | 'OVERDUE' | 'DISPUTED';

export type PurchaseOrderStatus =
  | 'OPEN'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type ExpenseFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type InventorySourceType = 'MANUAL' | 'DOCUMENT' | 'POS' | 'SYSTEM';

/**
 * Explicit reconciliation mapping from Transaction Category to Obligation Category (Section 6).
 * STATUTORY_TAX requires disambiguation between GST_PAYMENT and TDS_PAYMENT.
 */
export const TRANSACTION_TO_OBLIGATION_MAP: Record<TransactionCategory, ObligationCategory | 'AMBIGUOUS_STATUTORY'> = {
  CUSTOMER_RECEIPT: 'CUSTOMER_INVOICE',
  VENDOR_PAYMENT: 'VENDOR_BILL',
  STATUTORY_TAX: 'AMBIGUOUS_STATUTORY',
  UTILITY: 'UTILITY_BILL',
  SALARY: 'SALARY',
  OPERATING_EXPENSE: 'OTHER',
  LOAN_EMI: 'OTHER',
  OTHER: 'OTHER',
};

/**
 * Analytical Base Priority Weight Matrix for Obligations (Section 7).
 * Weights are used by the deterministic solver/optimization engines.
 */
export const OBLIGATION_BASE_PRIORITY_MATRIX: Record<
  ObligationCategory,
  { baseWeight: number; constraintLevel: 'HARD' | 'HIGH' | 'MEDIUM' | 'INFO' | 'LOW' }
> = {
  GST_PAYMENT: { baseWeight: 1.0, constraintLevel: 'HARD' },
  TDS_PAYMENT: { baseWeight: 1.0, constraintLevel: 'HARD' },
  SALARY: { baseWeight: 0.9, constraintLevel: 'HIGH' },
  UTILITY_BILL: { baseWeight: 0.85, constraintLevel: 'HIGH' },
  VENDOR_BILL: { baseWeight: 0.7, constraintLevel: 'MEDIUM' },
  CUSTOMER_INVOICE: { baseWeight: 0.6, constraintLevel: 'INFO' },
  OTHER: { baseWeight: 0.4, constraintLevel: 'LOW' },
};

// ============================================================================
// 2. Existing Canonical Entities (Retained & Extended)
// ============================================================================

export interface NormalizedDocumentRecord {
  id: string;
  tenantId: string;
  fileName?: string;
  s3Key: string;
  fileType?: string;
  documentType?: 'BANK_STATEMENT' | 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'OTHER' | string;
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED' | string;
  extractedEntityCount?: number;
  rawMetadata?: Record<string, unknown>;
  errorMessage?: string;
  processedAt?: string;
  sourceRecordIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface NormalizedTransaction {
  id: string;
  tenantId: string;
  documentId?: string;
  date: string; // ISO Date: YYYY-MM-DD
  amount: number; // Absolute amount in INR
  type: 'INFLOW' | 'OUTFLOW';
  paymentMode?: PaymentMode;
  counterpartyName?: string;
  counterpartyIdentifier?: string;
  category: TransactionCategory;
  statutoryId?: string;
  priorityWeight?: number;
  balanceAfterTransaction?: number;
  referenceNumber?: string;
  description?: string;
  status?: 'CONFIRMED' | 'PENDING' | 'RECONCILED' | string;

  // Optional Analytics Reconciliation Links
  productId?: string;
  supplierId?: string;
  saleId?: string;
  purchaseId?: string;
  obligationId?: string;
  sourceRecordIds?: string[];

  createdAt?: string;
  updatedAt?: string;
}

export interface NormalizedObligation {
  id: string;
  tenantId: string;
  documentId?: string;
  title: string;
  counterpartyName?: string;
  statutoryId?: string;
  amount: number; // Amount in INR
  dueDate?: string; // ISO Date: YYYY-MM-DD
  type: ObligationType; // 'PAYABLE' | 'RECEIVABLE'
  category: ObligationCategory;
  priorityWeight?: number;
  penaltyRatePerDay?: number;
  isStatutory?: boolean;
  status?: ObligationStatus;

  // Analytics Extensions & Receivable Fields
  supplierId?: string;
  productId?: string;
  allowPartialPayment?: boolean;
  expectedSettlementDate?: string; // ISO Date: YYYY-MM-DD
  probability?: number; // 0.0 to 1.0 (explicit or derived by approved deterministic rule)
  confidence?: ConfidenceLevel;
  priorityOverride?: number; // Merchant explicit priority override
  priorityOverrideReason?: string;
  sourceRecordIds?: string[];

  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// 3. New Canonical Business Entities
// ============================================================================

export interface MerchantFinancialSettings {
  id: string;
  tenantId: string;
  minimumCashBuffer: number; // In INR
  bufferRuleType?: 'ABSOLUTE_INR' | 'DAYS_OF_EXPENSE';
  defaultForecastHorizonDays?: number;
  defaultForecastHorizonWeeks?: number;
  enableConservativeFallbacks?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CashPositionSnapshot {
  id: string;
  tenantId: string;
  asOf: string; // ISO Date: YYYY-MM-DD
  bankBalance: number; // Verified liquid bank balance in INR
  cashOnHand?: number; // Verified physical cash on hand in INR
  totalLiquidCash: number; // bankBalance + cashOnHand in INR
  sourceDocumentIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  sku?: string;
  category?: string;
  unitOfMeasure: string; // e.g. 'kg', 'litre', 'pack', 'unit'
  isActive: boolean;
  aliases?: string[]; // Alternative document-extracted names mapped to this canonical product
  createdAt?: string;
  updatedAt?: string;
}

export interface Sale {
  id: string;
  tenantId: string;
  saleDate: string; // ISO Date: YYYY-MM-DD
  channel?: string; // 'RETAIL_COUNTER' | 'WHOLESALE' | 'ONLINE' | 'B2B'
  customerName?: string;
  grossAmount: number; // In INR
  discountAmount?: number; // In INR
  netSalesAmount: number; // grossAmount - discountAmount in INR
  documentId?: string;
  sourceRecordIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleLineItem {
  id: string;
  tenantId: string;
  saleId: string;
  productId: string;
  quantity: number; // In product's canonical unitOfMeasure
  unitSellingPrice: number; // In INR per unitOfMeasure
  grossAmount: number; // quantity * unitSellingPrice
  discountAmount?: number; // In INR
  returnQuantity?: number; // In product's canonical unitOfMeasure
  netSalesAmount: number; // In INR
  createdAt?: string;
  updatedAt?: string;
}

export interface InventorySnapshot {
  id: string;
  tenantId: string;
  snapshotDate: string; // ISO Date: YYYY-MM-DD
  sourceType?: InventorySourceType;
  documentId?: string;
  sourceRecordIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  inventorySnapshotId: string;
  productId: string;
  quantityOnHand: number; // In product's canonical unitOfMeasure
  unitPurchaseCost?: number; // In INR per unitOfMeasure
  inventoryValue?: number; // quantityOnHand * unitPurchaseCost in INR
  createdAt?: string;
  updatedAt?: string;
}

export interface Purchase {
  id: string;
  tenantId: string;
  purchaseDate: string; // ISO Date: YYYY-MM-DD
  supplierId?: string;
  supplierName?: string;
  totalAmount: number; // Total invoice/bill amount in INR
  documentId?: string;
  obligationId?: string;
  sourceRecordIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseLineItem {
  id: string;
  tenantId: string;
  purchaseId: string;
  productId: string;
  quantity: number; // In product's canonical unitOfMeasure
  unitPurchaseCost: number; // In INR per unitOfMeasure
  totalPurchaseAmount: number; // quantity * unitPurchaseCost in INR
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierProfile {
  id: string;
  tenantId: string;
  supplierName: string;
  leadTimeDays?: number;
  creditPeriodDays?: number;
  minimumOrderQuantity?: number;
  deliveryCost?: number; // In INR
  paymentTermsText?: string;
  reliabilityScore?: number; // 0.0 to 1.0 (from explicit upstream process)
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierProductTerms {
  id: string;
  tenantId: string;
  supplierId: string;
  productId: string;
  quotedUnitPrice?: number; // In INR
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  discountPercent?: number; // Percentage (e.g. 5.0 for 5%)
  discountThresholdQuantity?: number;
  deliveryCost?: number; // In INR
  effectiveFrom?: string; // ISO Date: YYYY-MM-DD
  effectiveTo?: string; // ISO Date: YYYY-MM-DD
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  supplierId?: string;
  orderDate: string; // ISO Date: YYYY-MM-DD
  expectedDeliveryDate?: string; // ISO Date: YYYY-MM-DD
  status: PurchaseOrderStatus;
  documentId?: string;
  sourceRecordIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrderLineItem {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  productId: string;
  orderedQuantity: number; // In product's canonical unitOfMeasure
  receivedQuantity?: number; // In product's canonical unitOfMeasure
  unitPurchaseCost?: number; // In INR per unitOfMeasure
  createdAt?: string;
  updatedAt?: string;
}

export interface RecurringExpense {
  id: string;
  tenantId: string;
  expenseType: string; // e.g., 'RENT', 'ELECTRICITY', 'PAYROLL', 'SUBSCRIPTION', 'TRANSPORT'
  amount: number; // In INR
  frequency: ExpenseFrequency;
  dueDayOfMonth?: number; // 1 to 31
  startDate?: string; // ISO Date: YYYY-MM-DD
  endDate?: string; // ISO Date: YYYY-MM-DD
  isActive: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
