# FinFine Pro — Data Schema Changes Required for Analytics Skills

## Purpose

This document translates the logical data requirements defined in `README_SKILL_GENERATION.md` into the concrete canonical data-schema changes required for the FinFine Pro analytics skill set.

This document is intentionally limited to **data-model requirements**.

It does **not** redesign:

- infrastructure,
- orchestration,
- compute architecture,
- AgentCore execution,
- storage topology,
- ingestion architecture,
- deployment,
- IAM,
- API Gateway,
- or frontend behavior.

The existing `DocumentRecord`, `Transaction`, and `Obligation` entities remain valid. The changes below extend the canonical business data available to analytics skills.

---

# 1. Why Schema Changes Are Required

The current normalized data model primarily represents:

- ingested documents,
- realized financial transactions,
- scheduled obligations / receivables.

That is sufficient for basic transaction-level liquidity analysis, but it is **not sufficient for the complete analytics skill set**.

The planned skills also require structured access to:

- merchant cash-buffer preferences,
- product identity,
- product-level sales history,
- inventory snapshots,
- purchase-cost history,
- supplier operational terms,
- open purchase orders,
- recurring expenses,
- expected receivables,
- and reliable cross-record source traceability.

Without these objects, the following skills cannot operate reliably:

- `sales-demand-forecasting`
- `inventory-and-stockout`
- `margin-and-pricing`
- `supplier-and-payables-optimization`
- `scenario-what-if-analysis`
- `opportunity-detector`

The goal is therefore to extend the canonical schema so that each skill receives explicit, normalized inputs rather than reconstructing business state from ambiguous transaction descriptions at query time.

---

# 2. Guiding Rule

The canonical schema should persist **merchant business state and source facts**.

Analytics outputs that can be recomputed should generally remain derived unless another requirement explicitly calls for persistence.

The following distinction should be maintained:

## Persist as canonical source/business state

Examples:

- product master data,
- inventory observations,
- historical sales,
- purchase-cost history,
- supplier terms,
- recurring expenses,
- merchant cash-buffer settings,
- expected receivables,
- open purchase orders.

## Derive at analytics time

Examples:

- days of stock,
- reorder points,
- stockout dates,
- forecast demand,
- unit margin,
- margin percentage,
- days-to-zero,
- lowest projected cash balance,
- scenario outcomes,
- optimization results.

This prevents analytics logic from being duplicated into stored fields that can become stale.

---

# 3. Existing Canonical Entities to Retain

The following existing entities remain part of the canonical data model.

## 3.1 DocumentRecord

Continue using `DocumentRecord` for:

- source-document identity,
- extraction status,
- document metadata,
- ingestion traceability,
- raw artifact linkage,
- extraction summaries.

No major analytics-driven structural change is required to this entity.

Recommended addition:

```ts
sourceRecordIds?: string[];
```

This is optional if document lineage is already recoverable through `documentId`.

---

## 3.2 Transaction

Continue using `Transaction` for realized cash movements.

Existing responsibilities remain:

- cash inflows,
- cash outflows,
- counterparty information,
- payment method,
- category,
- running balance,
- statutory IDs,
- reference numbers,
- source document linkage.

### Recommended analytics-facing additions

```ts
productId?: string;
supplierId?: string;
saleId?: string;
purchaseId?: string;
obligationId?: string;
```

These references should be optional.

They are useful when a realized transaction can be reconciled to a richer business record such as:

- a sale,
- a supplier purchase,
- an obligation settlement,
- or a product-related cash movement.

Do not require these fields for all transactions.

---

## 3.3 Obligation

Continue using `Obligation` for scheduled payables and receivables.

The existing distinction between:

```ts
type: "PAYABLE" | "RECEIVABLE"
```

should remain.

The obligation category enum should also remain separate from transaction categories.

Recommended additions are described later in the supplier/payables section.

---

# 4. New Canonical Entities Required

The following entities should be added to the canonical data model.

---

# 4.1 MerchantFinancialSettings

## Why it is required

Several analytics skills need merchant-specific operating constraints rather than generic assumptions.

Most importantly:

- minimum cash buffer,
- default forecast horizon,
- conservative-analysis preference.

Without an explicit settings object, the model may repeatedly ask for these values or silently assume them.

## Proposed schema

```ts
interface MerchantFinancialSettings {
  id: string;
  tenantId: string;

  minimumCashBuffer: number;

  bufferRuleType?: "ABSOLUTE_INR" | "DAYS_OF_EXPENSE";

  defaultForecastHorizonDays?: number;
  defaultForecastHorizonWeeks?: number;

  enableConservativeFallbacks?: boolean;

  createdAt: string;
  updatedAt: string;
}
```

## Used by

- `cashflow-and-buffer`
- `scenario-what-if-analysis`
- `supplier-and-payables-optimization`
- `opportunity-detector`
- `analytics-data-contract`

## Persist?

**Yes.**

This represents merchant configuration and should not have to be reconstructed.

---

# 4.2 Product

## Why it is required

Product-level analytics needs a stable identity across:

- sales,
- inventory,
- purchases,
- supplier records,
- forecasts.

Using only normalized product names is too fragile because names may vary across documents.

## Proposed schema

```ts
interface Product {
  id: string;
  tenantId: string;

  name: string;
  sku?: string;
  category?: string;

  unitOfMeasure: string;

  isActive: boolean;

  aliases?: string[];

  createdAt: string;
  updatedAt: string;
}
```

## Important rule

Analytics should prefer `productId` over product-name matching wherever possible.

`aliases` may be used during normalization to reconcile names such as:

```text
Sunflower Oil 1L
Sunflower 1 Litre
SF Oil 1L
```

to one canonical product.

## Used by

- `sales-demand-forecasting`
- `inventory-and-stockout`
- `margin-and-pricing`
- `supplier-and-payables-optimization`
- `opportunity-detector`

## Persist?

**Yes.**

---

# 4.3 Sale and SaleLineItem

## Why it is required

The existing `Transaction` entity tracks cash movement, not necessarily product-level commercial activity.

One customer payment may:

- contain multiple products,
- settle multiple invoices,
- arrive later than the actual sale,
- include discounts,
- include returns.

Demand forecasting and margin analytics therefore need a product-level sales representation separate from bank transactions.

## Proposed schema

```ts
interface Sale {
  id: string;
  tenantId: string;

  saleDate: string;

  channel?: string;
  customerName?: string;

  grossAmount: number;
  discountAmount?: number;
  netSalesAmount: number;

  documentId?: string;

  createdAt: string;
  updatedAt: string;
}
```

```ts
interface SaleLineItem {
  id: string;
  tenantId: string;

  saleId: string;
  productId: string;

  quantity: number;

  unitSellingPrice: number;
  grossAmount: number;

  discountAmount?: number;

  returnQuantity?: number;

  netSalesAmount: number;

  createdAt: string;
  updatedAt: string;
}
```

## Important rules

- sales should reflect **commercial demand**, not just customer cash receipts;
- quantities must use the product's canonical unit of measure;
- returns must not silently remain counted as demand;
- discounts must remain distinct from purchase costs.

## Used by

- `sales-demand-forecasting`
- `margin-and-pricing`
- `inventory-and-stockout`
- `opportunity-detector`

## Persist?

**Yes.**

---

# 4.4 InventorySnapshot and InventoryItem

## Why it is required

The stockout skill requires point-in-time inventory quantities.

A transaction ledger cannot reliably determine current inventory because inventory can change through:

- sales,
- purchases,
- wastage,
- spoilage,
- theft,
- corrections,
- manual stock counts,
- returns.

Therefore inventory must support explicit snapshots.

## Proposed schema

```ts
interface InventorySnapshot {
  id: string;
  tenantId: string;

  snapshotDate: string;
  sourceType?: "MANUAL" | "DOCUMENT" | "POS" | "SYSTEM";

  documentId?: string;

  createdAt: string;
  updatedAt: string;
}
```

```ts
interface InventoryItem {
  id: string;
  tenantId: string;

  inventorySnapshotId: string;
  productId: string;

  quantityOnHand: number;

  unitPurchaseCost?: number;
  inventoryValue?: number;

  createdAt: string;
  updatedAt: string;
}
```

## Important rules

- multiple historical snapshots should be allowed;
- analytics should use the latest valid snapshot as of the analysis date;
- `inventoryValue` should not be treated as the authoritative purchase-cost history;
- negative inventory should normally trigger validation warnings/errors.

## Used by

- `inventory-and-stockout`
- `supplier-and-payables-optimization`
- `scenario-what-if-analysis`
- `opportunity-detector`

## Persist?

**Yes.**

---

# 4.5 Purchase and PurchaseLineItem

## Why it is required

Margin analytics requires historical acquisition cost.

Inventory analytics also needs visibility into replenishment history.

Supplier analytics requires actual purchase records that can be tied back to suppliers.

## Proposed schema

```ts
interface Purchase {
  id: string;
  tenantId: string;

  purchaseDate: string;

  supplierId?: string;
  supplierName?: string;

  totalAmount: number;

  documentId?: string;
  obligationId?: string;

  createdAt: string;
  updatedAt: string;
}
```

```ts
interface PurchaseLineItem {
  id: string;
  tenantId: string;

  purchaseId: string;
  productId: string;

  quantity: number;

  unitPurchaseCost: number;
  totalPurchaseAmount: number;

  createdAt: string;
  updatedAt: string;
}
```

## Important rule

`PurchaseLineItem.unitPurchaseCost` is the preferred factual basis for historical cost analysis.

Skills must not infer purchase-cost changes solely from vendor cash outflows if product-level cost information is unavailable.

## Used by

- `margin-and-pricing`
- `inventory-and-stockout`
- `supplier-and-payables-optimization`
- `opportunity-detector`

## Persist?

**Yes.**

---

# 4.6 SupplierProfile

## Why it is required

The existing transaction and obligation records identify counterparties but do not capture operational supplier constraints required for purchasing decisions.

Supplier analytics requires structured information such as:

- lead time,
- credit period,
- MOQ,
- delivery cost,
- payment terms.

## Proposed schema

```ts
interface SupplierProfile {
  id: string;
  tenantId: string;

  supplierName: string;

  leadTimeDays?: number;
  creditPeriodDays?: number;

  minimumOrderQuantity?: number;
  deliveryCost?: number;

  paymentTermsText?: string;

  reliabilityScore?: number;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}
```

## Important rules

- `reliabilityScore` must come from an explicit upstream/manual process if used;
- the analytics skill must not invent supplier reliability or flexibility;
- supplier terms may be incomplete and must support null / missing values.

## Used by

- `supplier-and-payables-optimization`
- `inventory-and-stockout`
- `scenario-what-if-analysis`
- `opportunity-detector`

## Persist?

**Yes.**

---

# 4.7 SupplierProductTerms

## Why it is required

A supplier may offer different:

- prices,
- MOQ,
- lead times,
- discounts,

for different products.

Placing these only on `SupplierProfile` is insufficient when a merchant buys multiple products from the same supplier.

## Proposed schema

```ts
interface SupplierProductTerms {
  id: string;
  tenantId: string;

  supplierId: string;
  productId: string;

  quotedUnitPrice?: number;

  minimumOrderQuantity?: number;
  leadTimeDays?: number;

  discountPercent?: number;
  discountThresholdQuantity?: number;

  deliveryCost?: number;

  effectiveFrom?: string;
  effectiveTo?: string;

  createdAt: string;
  updatedAt: string;
}
```

## Used by

- `supplier-and-payables-optimization`
- `inventory-and-stockout`

## Persist?

**Yes**, if supplier comparison is part of the first usable analytics release.

Otherwise this may be added when supplier-product comparisons are introduced.

---

# 4.8 PurchaseOrder and PurchaseOrderLineItem

## Why it is required

Inventory analytics must know about inventory already ordered but not yet received.

Without open purchase orders, the system may incorrectly recommend duplicate replenishment.

## Proposed schema

```ts
interface PurchaseOrder {
  id: string;
  tenantId: string;

  supplierId?: string;

  orderDate: string;
  expectedDeliveryDate?: string;

  status:
    | "OPEN"
    | "PARTIALLY_RECEIVED"
    | "RECEIVED"
    | "CANCELLED";

  createdAt: string;
  updatedAt: string;
}
```

```ts
interface PurchaseOrderLineItem {
  id: string;
  tenantId: string;

  purchaseOrderId: string;
  productId: string;

  orderedQuantity: number;
  receivedQuantity?: number;

  unitPurchaseCost?: number;

  createdAt: string;
  updatedAt: string;
}
```

## Used by

- `inventory-and-stockout`
- `supplier-and-payables-optimization`
- `scenario-what-if-analysis`

## Persist?

**Yes.**

---

# 4.9 RecurringExpense

## Why it is required

Cash-flow analysis cannot rely only on historical transactions and explicit obligations.

Some predictable expenses repeat even when a future obligation record has not yet been created.

Examples:

- rent,
- electricity,
- payroll support costs,
- subscriptions,
- recurring transport costs.

## Proposed schema

```ts
interface RecurringExpense {
  id: string;
  tenantId: string;

  expenseType: string;
  amount: number;

  frequency:
    | "DAILY"
    | "WEEKLY"
    | "MONTHLY"
    | "QUARTERLY";

  dueDayOfMonth?: number;

  startDate?: string;
  endDate?: string;

  isActive: boolean;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}
```

## Used by

- `cashflow-and-buffer`
- `scenario-what-if-analysis`
- `opportunity-detector`

## Persist?

**Yes.**

---

# 4.10 ExpectedReceivable

## Why it is required

The current `Obligation` entity already allows:

```ts
type: "RECEIVABLE"
```

Therefore a separate physical `ExpectedReceivable` entity is **not strictly required** if the existing `Obligation` model is extended to carry all fields needed for receivable analytics.

The skill README defines `ExpectedReceivable` as a logical contract because skills need a clear receivable input shape.

## Recommended implementation

Prefer extending / using `Obligation` rather than creating a duplicate entity.

Add optional receivable-specific attributes to `Obligation`:

```ts
expectedSettlementDate?: string;
probability?: number;
confidence?: "HIGH" | "MEDIUM" | "LOW";
```

### Important rule

`probability` must be:

- explicitly provided,
- derived by an approved deterministic rule,
- or absent.

The analytics model must not invent settlement probabilities.

## Used by

- `cashflow-and-buffer`
- `scenario-what-if-analysis`
- `supplier-and-payables-optimization`

## Persist?

**Use existing `Obligation` where possible.**

A separate entity is unnecessary unless implementation constraints require it.

---

# 4.11 CashPositionSnapshot

## Why it is required

The skills need a clear authoritative starting cash position.

The current document model may contain statement opening/closing balances and transactions may contain running balances, but analytics should not have to infer which one is the current authoritative balance every time.

## Proposed schema

```ts
interface CashPositionSnapshot {
  id: string;
  tenantId: string;

  asOf: string;

  bankBalance: number;
  cashOnHand?: number;

  totalLiquidCash: number;

  sourceDocumentIds?: string[];

  createdAt: string;
  updatedAt: string;
}
```

## Important rule

`totalLiquidCash` should either:

1. be deterministically validated as the sum of the allowed components, or
2. be treated as a derived field.

Do not allow conflicting values silently.

## Used by

- `cashflow-and-buffer`
- `scenario-what-if-analysis`
- `supplier-and-payables-optimization`

## Persist?

**Recommended: yes.**

This avoids ambiguity around the analytics starting balance.

---

# 5. Existing Obligation Schema — Required Extensions

The obligation model should support richer analytics without changing its core purpose.

Recommended logical additions:

```ts
supplierId?: string;
productId?: string;

allowPartialPayment?: boolean;

expectedSettlementDate?: string;

probability?: number;

priorityOverride?: number;

priorityOverrideReason?: string;
```

## Notes

### `allowPartialPayment`

Needed because supplier/payables optimization must not assume that invoices can be split.

Default behavior should be:

```text
false / unspecified = do not assume partial payment
```

### `priorityOverride`

The analytics skill has an obligation-specific base priority matrix.

If the merchant explicitly overrides a priority, the override should be represented as data rather than inserted into prompt text.

### `priorityOverrideReason`

Required when an override is present for traceability and explanation.

---

# 6. Transaction and Obligation Categories Must Stay Separate

Do **not** merge the current transaction and obligation category enums.

They represent different concepts.

## Transaction categories

```ts
type TransactionCategory =
  | "CUSTOMER_RECEIPT"
  | "VENDOR_PAYMENT"
  | "STATUTORY_TAX"
  | "UTILITY"
  | "SALARY"
  | "OPERATING_EXPENSE"
  | "LOAN_EMI"
  | "OTHER";
```

## Obligation categories

```ts
type ObligationCategory =
  | "GST_PAYMENT"
  | "TDS_PAYMENT"
  | "VENDOR_BILL"
  | "UTILITY_BILL"
  | "SALARY"
  | "CUSTOMER_INVOICE"
  | "OTHER";
```

When reconciliation is required, use an explicit mapping.

| Transaction Category | Obligation Category |
|---|---|
| `CUSTOMER_RECEIPT` | `CUSTOMER_INVOICE` |
| `VENDOR_PAYMENT` | `VENDOR_BILL` |
| `STATUTORY_TAX` | `GST_PAYMENT` or `TDS_PAYMENT` |
| `UTILITY` | `UTILITY_BILL` |
| `SALARY` | `SALARY` |
| `OPERATING_EXPENSE` | `OTHER` |
| `LOAN_EMI` | `OTHER` |
| `OTHER` | `OTHER` |

`STATUTORY_TAX` requires additional information to distinguish GST from TDS.

If that distinction cannot be made reliably, the system should preserve the ambiguity rather than silently selecting one category.

---

# 7. Obligation Priority Rules Required by the Schema

Supplier/payables optimization requires obligation-specific priority information.

The analytical base matrix is:

| Obligation Category | Base Weight | Constraint Level |
|---|---:|---|
| `GST_PAYMENT` | 1.00 | HARD |
| `TDS_PAYMENT` | 1.00 | HARD |
| `SALARY` | 0.90 | HIGH |
| `UTILITY_BILL` | 0.85 | HIGH |
| `VENDOR_BILL` | 0.70 | MEDIUM |
| `CUSTOMER_INVOICE` | 0.60 | INFO |
| `OTHER` | 0.40 | LOW |

The schema does **not necessarily need to persist the base weight on every record**.

Recommended approach:

- persist factual obligation attributes,
- keep default priority weights in skill logic/configuration,
- persist only explicit merchant/system overrides.

Recommended fields:

```ts
priorityOverride?: number;
priorityOverrideReason?: string;
```

This avoids duplicating a rule-derived value across every obligation record.

---

# 8. Source Traceability

Every new canonical business entity should support traceability back to its source whenever possible.

Recommended fields:

```ts
documentId?: string;
sourceRecordIds?: string[];
```

At least one form of source reference should be available for records derived from documents or other normalized records.

This is especially important for:

- sales,
- purchases,
- inventory snapshots,
- purchase orders,
- obligations.

It allows analytics outputs to populate:

```json
{
  "sourceRecordIds": []
}
```

without relying on narrative provenance.

---

# 9. Data Freshness Requirements

The schema should contain enough timestamp information for the `analytics-data-contract` skill to determine whether a value is stale.

At minimum:

```ts
createdAt: string;
updatedAt: string;
```

Time-sensitive snapshots additionally need business timestamps:

```ts
snapshotDate
asOf
saleDate
purchaseDate
orderDate
expectedDeliveryDate
dueDate
```

The exact freshness threshold belongs in skill logic rather than storage architecture.

Examples:

- an inventory snapshot may become stale quickly,
- historical sales do not become stale in the same sense,
- supplier terms may remain valid much longer.

---

# 10. Money and Quantity Semantics

Every monetary field must explicitly represent INR unless multi-currency support is added later.

Examples:

```ts
amount: number;
unitSellingPrice: number;
unitPurchaseCost: number;
deliveryCost: number;
minimumCashBuffer: number;
```

The skill layer must not mix:

- percentages,
- rupees,
- quantities,
- days,

without explicit field names and units.

Quantities must use the product's canonical `unitOfMeasure`.

Example:

```text
quantity = 10
unitOfMeasure = "kg"
```

rather than storing an ambiguous numeric quantity.

---

# 11. Minimum Schema Needed by Each Skill

## analytics-orchestrator

No dedicated business entity.

Depends on all downstream schemas.

---

## merchant-intake

Must be able to populate:

- `MerchantFinancialSettings`
- `CashPositionSnapshot`
- `Product`
- `Sale`
- `SaleLineItem`
- `InventorySnapshot`
- `InventoryItem`
- `Purchase`
- `PurchaseLineItem`
- `SupplierProfile`
- `SupplierProductTerms`
- `PurchaseOrder`
- `PurchaseOrderLineItem`
- `RecurringExpense`
- `Obligation`

---

## analytics-data-contract

Validates all canonical schemas.

No additional entity required.

---

## code-interpreter-execution

No dedicated canonical entity required.

Receives structured analytics inputs.

---

## cashflow-and-buffer

Requires:

- `CashPositionSnapshot`
- `MerchantFinancialSettings`
- `Obligation`
- `RecurringExpense`
- relevant `Transaction` history
- receivable information

---

## sales-demand-forecasting

Requires:

- `Product`
- `Sale`
- `SaleLineItem`

Recommended:

- returns and discount information in `SaleLineItem`.

---

## inventory-and-stockout

Requires:

- `Product`
- `InventorySnapshot`
- `InventoryItem`
- sales / forecast inputs

Recommended:

- `SupplierProfile`
- `SupplierProductTerms`
- `PurchaseOrder`
- `PurchaseOrderLineItem`

---

## margin-and-pricing

Requires:

- `Product`
- `SaleLineItem`
- `PurchaseLineItem`

Purchase-cost history is mandatory for historical margin-change analysis.

---

## supplier-and-payables-optimization

Requires:

- `SupplierProfile`
- `Obligation`
- `MerchantFinancialSettings`
- `CashPositionSnapshot`

For purchasing optimization also requires:

- `SupplierProductTerms`
- `InventoryItem`
- `PurchaseOrder`
- demand forecast outputs.

---

## scenario-what-if-analysis

Consumes whichever canonical entities are relevant to the hypothetical scenario.

Typical dependencies:

- `CashPositionSnapshot`
- `MerchantFinancialSettings`
- `Obligation`
- `RecurringExpense`
- `InventoryItem`
- `Product`
- forecast inputs.

No scenario-specific persistent entity is required by this specification.

---

## opportunity-detector

No additional canonical entity required.

It composes analytics generated from the other domains.

---

## validation-and-uncertainty

No dedicated business entity required.

It validates the canonical schemas and analytical outputs.

---

## financial-explanation

No dedicated business entity required.

It consumes validated analytics results.

---

# 12. Recommended Schema Change Priority

The full set can be implemented incrementally.

## Priority 1 — required for core analytics

Add:

```text
MerchantFinancialSettings
CashPositionSnapshot
Product
Sale
SaleLineItem
InventorySnapshot
InventoryItem
Purchase
PurchaseLineItem
RecurringExpense
```

These unlock:

- cash-buffer analysis,
- product demand forecasting,
- stockout analysis,
- margin analysis.

---

## Priority 2 — required for supplier optimization

Add:

```text
SupplierProfile
SupplierProductTerms
PurchaseOrder
PurchaseOrderLineItem
```

Extend:

```text
Obligation
```

with supplier and payment-flexibility fields.

These unlock more reliable:

- supplier comparisons,
- reorder decisions,
- supplier/payables optimization.

---

## Priority 3 — refinements

Add or strengthen:

- product aliases,
- explicit record reconciliation links,
- priority overrides,
- source-record traceability,
- receivable confidence/probability where explicitly available.

These improve data quality and explainability but should not block the first core analytics implementation.

---

# 13. What Does Not Need to Be Added

Do not add persistent fields merely because an analytics skill calculates them.

The following should remain derived analytics outputs unless another product requirement explicitly requires storage:

```text
daysToZero
daysToMinimumBuffer
projectedBalance
firstBufferBreachDate
forecastDemand
demandVolatility
daysOfStock
reorderPoint
safetyStock
stockoutDate
unitMargin
marginPercent
deadStockValue
excessInventory
paybackPeriod
optimizationScore
recommendedPaymentSchedule
```

Storing these as canonical state risks stale or inconsistent analytics.

---

# 14. Recommended Canonical Entity Set After Changes

The analytics-capable canonical model should expose the following concepts:

```text
Existing:
- DocumentRecord
- Transaction
- Obligation

Add:
- MerchantFinancialSettings
- CashPositionSnapshot
- Product
- Sale
- SaleLineItem
- InventorySnapshot
- InventoryItem
- Purchase
- PurchaseLineItem
- SupplierProfile
- SupplierProductTerms
- PurchaseOrder
- PurchaseOrderLineItem
- RecurringExpense
```

`ExpectedReceivable` should generally be represented through the existing `Obligation` model with `type = RECEIVABLE`, rather than duplicated.

---

# 15. Acceptance Criteria

The schema update is sufficient for the skills when all of the following are true:

1. A product has a stable canonical identifier.
2. Historical product-level quantities sold can be queried.
3. Historical selling prices can be queried.
4. Historical product purchase costs can be queried.
5. Current inventory can be determined from a dated snapshot.
6. Open purchase quantities can be determined.
7. Supplier lead time can be represented.
8. Supplier MOQ and credit terms can be represented.
9. Fixed / recurring expenses can be represented.
10. Current liquid cash can be supplied with an `asOf` timestamp.
11. Minimum merchant cash buffer can be retrieved.
12. Payables and expected receivables can be queried by date.
13. Partial-payment permission can be represented rather than assumed.
14. Transaction and obligation categories remain distinguishable.
15. Analytics can trace important source facts to canonical record IDs.
16. No analytics skill must reconstruct critical business facts from free-form transaction descriptions when a canonical field should exist.

When these conditions are met, the skill set defined in `README_SKILL_GENERATION.md` has the canonical input model required to operate as designed.

---

# 16. Scope Boundary

This document intentionally does not decide:

- DynamoDB single-table key design for the new entities,
- GSI structure,
- access-pattern implementation,
- Amplify model definitions,
- migration strategy,
- ingestion pipeline changes,
- backfill strategy,
- AgentCore implementation,
- Code Interpreter runtime behavior,
- generated-code persistence,
- analytics-run persistence.

Those decisions belong to their respective architecture and implementation documents.

This document defines only **what canonical business data the analytics skills need to exist**.
