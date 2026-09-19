---
name: merchant-intake
description: Collect only missing, stale, incomplete, or changed FinFine Pro merchant data for onboarding or analytics updates and return canonical structured business objects.
---

# Merchant Intake

## Purpose

Collect and validate merchant information needed by downstream analytics without repeatedly requesting data that is already usable.

## When to Use

Use in `onboarding` mode for initial setup, or in `update` mode when `analytics-data-contract` identifies missing, stale, incomplete, or merchant-changed fields.

## When Not to Use

Do not run on every analytics request. Do not calculate forecasts, cash flow, inventory risk, margins, supplier rankings, or scenarios. Do not ingest or normalize documents.

## Required Inputs

- `mode`: `onboarding` or `update`.
- `merchantId`.
- The analytics request or onboarding objective.
- Available canonical merchant objects and the validation report describing gaps.

For analytics readiness, collect when missing: current cash position, 3–6 months of product-level sales history, current inventory, purchase-cost information, upcoming supplier payments, recurring expenses, and minimum cash buffer.

## Optional Inputs

- Supplier lead time, credit period, minimum order quantity, delivery cost, and reliability.
- Open purchase orders.
- Product unit of measure.
- Discounts, returns, variable expenses, and expected receivables.
- Merchant timezone, preferred language, business type, and default forecast horizons.

## Input Validation Rules

1. Ask only for fields listed as missing, stale, incomplete, or changed.
2. Align accepted values to `MerchantProfile`, `MerchantFinancialSettings`, `CashPositionSnapshot`, `ProductMaster`, `SalesRecord`, `InventorySnapshot`, `PurchaseRecord`, `SupplierProfile`, `PurchaseOrder`, `RecurringExpense`, `ExpectedReceivable`, `TransactionRecord`, and `ObligationRecord`.
3. Require INR for all monetary values; reject or flag unconverted currency.
4. Require ISO `YYYY-MM-DD` dates and non-empty identifiers.
5. Reject negative quantities and costs unless a schema explicitly represents the event through a separate field such as `returnQuantity`.
6. Require `sourceRecordIds` where the canonical schema defines them.
7. Keep facts supplied by records separate from explicit merchant assumptions.

## Freshness / Reuse Rules

- Reuse any field that `analytics-data-contract` marks current and complete.
- Treat cash and inventory as point-in-time snapshots; request updates when their `asOf` or `snapshotDate` is too old for the requested horizon or material decisions occurred afterward.
- Treat historical records as reusable unless corrected or superseded.
- Treat settings and supplier terms as reusable until the merchant reports a change or validation detects a conflict.

## Financial Logic / Analytical Rules

- Intake performs no authoritative financial arithmetic.
- Preserve confirmed and expected inflows as distinct records.
- Represent payments and receivables as `ObligationRecord` objects when due-date analysis is required.
- Do not infer purchase cost from selling price, infer lead time from order dates without an explicit downstream rule, or derive minimum cash buffer from generic advice.

## Allowed Methods

- Targeted questions for individual missing fields or compact groups of related fields.
- Schema normalization that does not change business meaning, such as ISO date formatting or explicit INR formatting.
- Returning a partial structured intake result with gaps clearly enumerated.

## Disallowed Behavior

- Inventing uplift, supplier terms, cost, lead time, cash, inventory, or buffer values.
- Asking again for current validated data.
- Merging transaction and obligation categories.
- Performing document ingestion or analytics calculations.
- Treating optional fields as required unless a selected domain skill requires them.

## Code Interpreter Execution Rules

Code Interpreter is not required for conversational collection or simple schema checks. If batch parsing, date normalization, or duplicate detection requires code, use `code-interpreter-execution`, perform no financial calculation, and return structured objects plus validation warnings.

## Output Contract

Return canonical objects and intake status:

```json
{
  "analysisType": "merchant-intake",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "mode": "onboarding|update",
    "canonicalObjects": {},
    "collectedFields": [],
    "remainingMissingFields": [],
    "readyForRequestedAnalysis": false
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: a required field can be supplied directly by the merchant.
- `return_warning_and_continue_with_fallback`: the downstream skill explicitly permits operation without an optional field.
- `stop_and_return_insufficient_data`: required identity, currency, dates, or financial inputs remain unavailable and no domain fallback exists.

## Example Requests

- "Set up my shop for cash-flow and stock analysis."
- "My supplier changed its credit period to 30 days."
- "Update only the inventory snapshot that the forecast says is stale."

## Example Structured Outputs

```json
{
  "analysisType": "merchant-intake",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "mode": "update",
    "canonicalObjects": {"MerchantFinancialSettings": {"merchantId": "m-1", "minimumCashBuffer": 250000, "bufferRuleType": "ABSOLUTE_INR"}},
    "collectedFields": ["MerchantFinancialSettings.minimumCashBuffer"],
    "remainingMissingFields": [],
    "readyForRequestedAnalysis": true
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": []
}
```
