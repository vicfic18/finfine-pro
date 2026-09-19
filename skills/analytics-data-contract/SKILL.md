---
name: analytics-data-contract
description: Validate FinFine Pro analytics inputs against the shared logical schemas, category mappings, priority rules, completeness requirements, and freshness expectations.
---

# Analytics Data Contract

## Purpose

Provide the canonical skill-facing data contract for all analytics, validate reusable merchant data, and determine whether targeted merchant intake is required.

## When to Use

Use before every FinFine Pro analytics calculation and whenever new or updated merchant data enters an analytics workflow.

## When Not to Use

Do not use as a database schema, persistence contract, document-ingestion format, or source of new financial formulas. Do not calculate domain results.

## Required Inputs

- `merchantId`, `asOf`, requested analysis type, and horizon where applicable.
- The canonical objects required by the selected domain skill.
- Source record identifiers where the object's schema requires them.

Canonical objects are `MerchantProfile`, `MerchantFinancialSettings`, `CashPositionSnapshot`, `ProductMaster`, `SalesRecord` and `SalesLineItem`, `InventorySnapshot` and `InventoryItem`, `PurchaseRecord` and `PurchaseLineItem`, `SupplierProfile`, `PurchaseOrder` and `PurchaseOrderLineItem`, `RecurringExpense`, `ExpectedReceivable`, `TransactionRecord`, and `ObligationRecord`.

## Optional Inputs

- Canonical objects not required by the selected domain skill.
- Prior data-quality reports and fresh validated structured results.
- Explicit merchant constraints and assumptions.

## Input Validation Rules

1. Require matching `merchantId` across all objects.
2. Require INR as `MerchantProfile.primaryCurrency`; flag any inconsistent monetary source.
3. Require ISO `YYYY-MM-DD` dates, stable identifiers, and accepted enum values exactly as defined by the canonical schemas.
4. Confirm required numeric fields are finite. Quantities, prices, costs, balances, expense amounts, and obligation amounts must not be impossible for their field semantics.
5. Verify line totals where possible: `grossAmount`, `netSalesAmount`, `totalPurchaseAmount`, and `totalLiquidCash` must reconcile or produce explicit warnings.
6. Detect duplicate record IDs and likely duplicate sales without silently deleting them.
7. Validate product identity using `productId`; use names only as labels and flag mismatches.
8. Require `sourceRecordIds` for schemas that define them, and return the union of records actually used.
9. For transaction-to-obligation reconciliation only, map: `CUSTOMER_RECEIPT` to `CUSTOMER_INVOICE`, `VENDOR_PAYMENT` to `VENDOR_BILL`, `STATUTORY_TAX` to `GST_PAYMENT` or `TDS_PAYMENT`, `UTILITY` to `UTILITY_BILL`, `SALARY` to `SALARY`, and `OPERATING_EXPENSE`, `LOAN_EMI`, or `OTHER` to `OTHER`. Ambiguous statutory mapping requires clarification or a warning.
10. Use the obligation base priority weights only in supplier/payables work: `GST_PAYMENT` 1.00 HARD, `TDS_PAYMENT` 1.00 HARD, `SALARY` 0.90 HIGH, `UTILITY_BILL` 0.85 HIGH, `VENDOR_BILL` 0.70 MEDIUM, `CUSTOMER_INVOICE` 0.60 INFO, `OTHER` 0.40 LOW.

## Freshness / Reuse Rules

- Evaluate freshness relative to `asOf`, analysis horizon, source update frequency, and known business changes.
- Cash and inventory snapshots must represent the latest available state suitable for the decision; otherwise mark stale and request an update.
- Historical sales and purchase records remain reusable unless corrected, duplicated, or outside the analysis window.
- Supplier profiles and financial settings remain reusable until changed or contradicted.
- Prior analytical results are reusable only when calculation version, source records, `asOf`, horizon, and relevant assumptions still match.

## Financial Logic / Analytical Rules

- This skill validates meaning and completeness; it does not invent data or perform a domain calculation.
- Determine completeness from the selected domain skill's required inputs, not from every field in every schema.
- Preserve the difference between confirmed and expected cash flows and between transactions and obligations.
- Base priority weights may be adjusted only by explicitly supplied due-date proximity, penalty rate, cash-buffer impact, inventory coverage risk, supplier dependency, or merchant constraints.

The canonical skill-facing schemas are:

```ts
interface MerchantProfile {
  merchantId: string;
  merchantName?: string;
  primaryCurrency: "INR";
  timezone?: string;
  preferredLanguage?: "en" | "hi" | "hinglish" | "ta" | "other";
  businessType?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MerchantFinancialSettings {
  merchantId: string;
  minimumCashBuffer: number;
  bufferRuleType?: "ABSOLUTE_INR" | "DAYS_OF_EXPENSE";
  defaultForecastHorizonDays?: number;
  defaultForecastHorizonWeeks?: number;
  enableConservativeFallbacks?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface CashPositionSnapshot {
  merchantId: string;
  asOf: string;
  bankBalance: number;
  cashOnHand?: number;
  totalLiquidCash: number;
  sourceRecordIds: string[];
}

interface ProductMaster {
  productId: string;
  merchantId: string;
  productName: string;
  sku?: string;
  category?: string;
  unitOfMeasure: string;
  isActive: boolean;
}

interface SalesRecord {
  saleId: string;
  merchantId: string;
  saleDate: string;
  channel?: string;
  sourceRecordIds: string[];
  lineItems: SalesLineItem[];
}

interface SalesLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitSellingPrice: number;
  grossAmount: number;
  discountAmount?: number;
  returnQuantity?: number;
  netSalesAmount: number;
}

interface InventorySnapshot {
  snapshotId: string;
  merchantId: string;
  snapshotDate: string;
  items: InventoryItem[];
  sourceRecordIds: string[];
}

interface InventoryItem {
  productId: string;
  productName: string;
  quantityOnHand: number;
  unitPurchaseCost?: number;
  inventoryValue?: number;
}

interface PurchaseRecord {
  purchaseId: string;
  merchantId: string;
  purchaseDate: string;
  supplierId?: string;
  supplierName?: string;
  sourceRecordIds: string[];
  lineItems: PurchaseLineItem[];
}

interface PurchaseLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPurchaseCost: number;
  totalPurchaseAmount: number;
}

interface SupplierProfile {
  supplierId: string;
  merchantId: string;
  supplierName: string;
  leadTimeDays?: number;
  creditPeriodDays?: number;
  minimumOrderQuantity?: number;
  deliveryCost?: number;
  paymentTermsText?: string;
  reliabilityScore?: number;
  notes?: string;
}

interface PurchaseOrder {
  purchaseOrderId: string;
  merchantId: string;
  supplierId?: string;
  supplierName?: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  status: "OPEN" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
  lineItems: PurchaseOrderLineItem[];
}

interface PurchaseOrderLineItem {
  productId: string;
  productName: string;
  orderedQuantity: number;
  unitPurchaseCost?: number;
}

interface RecurringExpense {
  expenseId: string;
  merchantId: string;
  expenseType: string;
  amount: number;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
  dueDayOfMonth?: number;
  notes?: string;
}

interface ExpectedReceivable {
  receivableId: string;
  merchantId: string;
  counterpartyName: string;
  amount: number;
  expectedDate: string;
  probability?: number;
  sourceRecordIds: string[];
}

interface TransactionRecord {
  transactionId: string;
  merchantId: string;
  date: string;
  amount: number;
  type: "INFLOW" | "OUTFLOW";
  paymentMode?: "UPI" | "NEFT" | "IMPS" | "CARD" | "CASH" | "CHEQUE" | "AUTOPAY" | "OTHER";
  counterpartyName?: string;
  counterpartyIdentifier?: string;
  category: TransactionCategory;
  description?: string;
  balanceAfterTransaction?: number;
  sourceRecordIds: string[];
}

type TransactionCategory =
  | "CUSTOMER_RECEIPT"
  | "VENDOR_PAYMENT"
  | "STATUTORY_TAX"
  | "UTILITY"
  | "SALARY"
  | "OPERATING_EXPENSE"
  | "LOAN_EMI"
  | "OTHER";

interface ObligationRecord {
  obligationId: string;
  merchantId: string;
  title: string;
  counterpartyName: string;
  amount: number;
  dueDate: string;
  type: "PAYABLE" | "RECEIVABLE";
  category: ObligationCategory;
  isStatutory?: boolean;
  penaltyRatePerDay?: number;
  status?: "SCHEDULED" | "PAID" | "OVERDUE" | "DISPUTED";
  sourceRecordIds: string[];
}

type ObligationCategory =
  | "GST_PAYMENT"
  | "TDS_PAYMENT"
  | "VENDOR_BILL"
  | "UTILITY_BILL"
  | "SALARY"
  | "CUSTOMER_INVOICE"
  | "OTHER";
```

All monetary values are INR. All date fields must use `YYYY-MM-DD`; timestamp metadata, when present, must use a consistent ISO-8601 representation. Fields marked `?` are optional; all others are required.

Minimum completeness by domain is:

- Cash flow: current `CashPositionSnapshot`, dated inflows, dated outflows, minimum cash buffer, `asOf`, and horizon.
- Demand forecasting: product-level `SalesRecord`, `ProductMaster`, `asOf`, and horizon.
- Inventory: `InventorySnapshot` plus a demand forecast or allowed fallback; lead time is additionally required for complete reorder outputs.
- Margin: `SalesRecord`, `PurchaseRecord`, `ProductMaster`, and an applicable purchase-cost basis.
- Supplier/payables: comparable supplier cost inputs or payable obligations plus every constraint needed by the requested objective; cash and inventory results are required when those constraints apply.
- Scenario: a valid baseline, explicit scenario changes, horizon, and every affected domain dependency.
- Opportunity detection: at least one fresh validated domain result.

## Allowed Methods

- Type, enum, range, uniqueness, referential-integrity, reconciliation, completeness, and freshness checks.
- Explicit canonical normalization that preserves meaning.
- Cross-entity reconciliation using only the defined mapping.
- Structured gap reporting for `merchant-intake`.

## Disallowed Behavior

- Describing canonical objects as database tables.
- Inventing category mappings, priority systems, merchant assumptions, or replacement values.
- Silently dropping invalid or duplicate records.
- Treating an optional field as globally required.
- Performing domain calculations or persistence operations.

## Code Interpreter Execution Rules

Use Code Interpreter for non-trivial batch validation, reconciliation, duplicate detection, and completeness profiling. Use only approved packages, no internet, and no persistence. Return machine-readable validation results; do not repair financial values without an explicit rule and traceable source.

## Output Contract

```json
{
  "analysisType": "analytics-data-validation",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "validObjects": [],
    "invalidFields": [],
    "missingRequiredFields": [],
    "staleFields": [],
    "categoryMappingIssues": [],
    "needsMerchantIntake": false,
    "readyForExecution": false
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: required fields are available from the merchant or an ambiguous statutory category needs classification.
- `return_warning_and_continue_with_fallback`: the selected domain skill defines a safe fallback for the missing or stale field.
- `stop_and_return_insufficient_data`: tenant mismatch, unsupported currency, impossible required values, or required data without an allowed fallback.

## Example Requests

- "Validate the data needed for a 30-day cash-flow projection."
- "Can these sales and inventory objects support stockout analysis?"
- "Map these vendor payments to obligations before optimization."

## Example Structured Outputs

```json
{
  "analysisType": "analytics-data-validation",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "validObjects": ["MerchantProfile", "InventorySnapshot", "SalesRecord"],
    "invalidFields": [],
    "missingRequiredFields": ["SupplierProfile.leadTimeDays"],
    "staleFields": [],
    "categoryMappingIssues": [],
    "needsMerchantIntake": true,
    "readyForExecution": true
  },
  "assumptions": [],
  "warnings": ["Stock coverage can run, but reorder-point output will be partial without lead time."],
  "dataQuality": "medium",
  "confidence": "high",
  "sourceRecordIds": ["sale-101", "inventory-22"]
}
```
