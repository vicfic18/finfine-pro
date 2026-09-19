---
name: inventory-and-stockout
description: Calculate FinFine Pro stock coverage, stockout timing, reorder risk, reorder quantities, safety stock, dead stock, and excess inventory from validated inventory and demand.
---

# Inventory and Stockout

## Purpose

Estimate how long current stock will last and identify products requiring reorder, excess-stock review, or dead-stock attention.

## When to Use

Use for stock coverage, stockout dates, reorder timing and quantity, safety stock, dead stock, excess inventory, or inventory-capital questions.

## When Not to Use

Do not create an independent demand forecast when a fresh forecast is absent; invoke `sales-demand-forecasting`. Do not calculate margin without a purchase-cost basis or choose suppliers by itself.

## Required Inputs

- Current `InventorySnapshot` with product identity.
- A fresh product-level demand forecast or explicitly permitted observed-demand fallback.
- `asOf` and planning horizon.

Supplier lead time is required for complete reorder-point, reorder-date, and stockout-during-lead-time outputs.

## Optional Inputs

- `SupplierProfile.leadTimeDays`, minimum order quantity, and delivery schedule.
- Open `PurchaseOrder` quantities and expected delivery dates.
- Unit purchase cost for dead-stock and excess-inventory value.
- Explicit service level or safety-stock policy.

## Input Validation Rules

1. Require one latest inventory quantity per product and flag duplicate or conflicting snapshots.
2. Reject negative on-hand quantities and invalid units of measure.
3. Ensure demand and inventory refer to the same `productId` and compatible units.
4. Exclude cancelled purchase orders; count open or partially received quantities only when expected arrival is known.
5. Do not compute inventory value without a unit purchase cost.
6. Flag zero or negative expected demand rather than dividing by it.

## Freshness / Reuse Rules

- Use the latest inventory snapshot suitable for `asOf`; any known sales, receipts, damage, or adjustments after it make it stale.
- Reuse demand forecasts only within their covered dates and unchanged source/version context.
- Recompute when inventory, demand, lead time, purchase orders, safety-stock policy, or horizon changes.

## Financial Logic / Analytical Rules

Calculate, when expected daily demand is positive:

```text
days_of_stock = quantity_on_hand / expected_daily_demand
```

When lead time and an approved safety-stock value are available:

```text
reorder_point = expected_demand_during_lead_time + safety_stock
```

- Estimate stockout date by consuming projected demand chronologically from on-hand stock and adding eligible inbound quantities on their expected delivery dates.
- Mark a product below reorder point when its inventory position is less than or equal to the calculated reorder point. Inventory position may include dated eligible inbound stock, but the output must disclose this.
- Suggested reorder date is the latest date an order can be placed before projected stock reaches safety stock, using validated lead time.
- Suggested reorder quantity covers explicit target demand plus safety stock minus inventory position; round up only to the supplied unit or MOQ and disclose the rounding.
- Calculate safety stock only from an explicitly supplied policy or, when explicitly approved, `service_level_z × demand_standard_deviation × sqrt(lead_time_days)`. Otherwise return `null`, not zero.
- A dead-stock candidate has positive on-hand stock and no observed or forecast demand over the stated review window. Its value requires cost basis.
- Excess inventory is stock above demand plus approved safety stock for the stated target horizon; report quantity and value only when their inputs exist.

## Allowed Methods

- Deterministic chronological stock depletion.
- Low/base/high stockout paths from demand scenarios.
- Reorder-point calculation using the specified formula.
- Safety-stock calculation only under the explicit policy described above.
- MOQ and unit-of-measure rounding from validated supplier/product data.

## Disallowed Behavior

- Inventing lead time, safety stock, MOQ, inbound date, demand, or unit cost.
- Reporting a reorder point as complete when lead time or safety-stock basis is missing.
- Treating undated purchase orders as available stock.
- Assigning monetary value without cost basis.
- Performing authoritative arithmetic outside Code Interpreter.

## Code Interpreter Execution Rules

Use Code Interpreter to align product units, simulate dated inventory balances, calculate coverage and reorder outputs, apply MOQ rounding, and serialize product-level results. Preserve the forecast scenario label and source IDs. Return `null` for unavailable numeric outputs and pair it with a warning.

## Output Contract

```json
{
  "analysisType": "stockout-risk",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "products": [{
      "productId": "string",
      "daysOfStock": null,
      "likelyStockoutDate": null,
      "belowReorderPoint": null,
      "reorderPoint": null,
      "suggestedReorderDate": null,
      "suggestedReorderQuantity": null,
      "safetyStock": null,
      "deadStockQuantity": 0,
      "deadStockValue": null,
      "excessInventoryQuantity": 0,
      "excessInventoryValue": null
    }]
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: inventory snapshot, demand basis, horizon, or requested reorder parameter is missing.
- `return_warning_and_continue_with_fallback`: lead time or cost is missing; return coverage/stockout outputs that remain valid and mark reorder/value fields partial.
- `stop_and_return_insufficient_data`: no usable inventory quantity, incompatible units, or no demand basis for the requested calculation.

## Example Requests

- "When will sunflower oil run out?"
- "Which products are below their reorder point?"
- "How much dead stock and excess inventory am I holding?"

## Example Structured Outputs

```json
{
  "analysisType": "stockout-risk",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "products": [{"productId": "p-7", "daysOfStock": 9.5, "likelyStockoutDate": "2026-09-29", "belowReorderPoint": true, "reorderPoint": 55, "suggestedReorderDate": "2026-09-20", "suggestedReorderQuantity": 80, "safetyStock": 10, "deadStockQuantity": 0, "deadStockValue": 0, "excessInventoryQuantity": 0, "excessInventoryValue": 0}]
  },
  "assumptions": ["Base demand scenario used."],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "medium",
  "sourceRecordIds": ["inventory-22", "sale-1", "supplier-3"]
}
```
