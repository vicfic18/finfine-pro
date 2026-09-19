---
name: margin-and-pricing
description: Analyze FinFine Pro product unit margins, below-cost sales, purchase-cost changes, weak-margin revenue, and selling-price adequacy from validated sales and cost history.
---

# Margin and Pricing

## Purpose

Evaluate product unit economics and identify prices that do not adequately reflect validated purchase costs.

## When to Use

Use for margin analysis, below-cost sales, cost increases, margin deterioration, high-revenue weak-margin products, or selling-price adequacy.

## When Not to Use

Do not use without a purchase-cost basis. Do not infer costs from prices, benchmark competitors, forecast demand, or recommend a new price based on invented elasticity or target margin.

## Required Inputs

- Product-level `SalesRecord` data.
- Product-level `PurchaseRecord` cost history.
- Stable product identity from `ProductMaster`.
- `asOf` and analysis period.

## Optional Inputs

- Explicit cost-basis choice: latest purchase cost at or before sale, period weighted-average cost, or another approved basis.
- Discounts, returns, channel, category, and comparison period.
- Explicit target margin supplied by the merchant.

## Input Validation Rules

1. Require a valid positive selling price and purchase-cost basis for every analyzed unit.
2. Match sales and costs by `productId`, not product name; flag name mismatches.
3. Use `netSalesAmount` and net quantity after returns for realized analysis, with divide-by-zero checks.
4. Verify purchase amount approximately reconciles to quantity times unit purchase cost and flag conflicts.
5. Flag missing historical cost periods rather than carrying a cost across an unknown interval silently.
6. Keep listed unit price, realized net unit price, and purchase cost distinct.

## Freshness / Reuse Rules

- Use purchase costs effective at or before the relevant sale date. Future purchase prices must not revise historical realized margins.
- Reuse historical sales and purchase records until corrected; recompute when records, cost-basis choice, returns, discounts, or analysis period changes.
- For current price adequacy, use the latest validated purchase cost available as of `asOf` and clearly label it.

## Financial Logic / Analytical Rules

For a selected valid cost basis:

```text
unit_margin = selling_price - purchase_cost
margin_percent = unit_margin / selling_price
```

- Default to latest validated purchase cost at or before each sale when no explicit cost-basis choice is supplied; disclose the basis.
- A period weighted-average cost is allowed only when purchase quantities and costs for the period are complete.
- A product is below cost when unit margin is negative.
- Purchase-cost increase is the change between comparable chronological validated cost observations; report absolute and percent change, with no percent when the prior cost is zero.
- Margin deterioration is a decline in comparable unit margin or margin percent between disclosed periods.
- High-revenue/weak-margin classification requires reporting the revenue ranking and the explicit margin threshold or target used; without a threshold, rank results without attaching a prescriptive label.
- Price-not-keeping-pace compares selling-price change with purchase-cost change over the same disclosed periods.

## Allowed Methods

- Latest-prior purchase cost matching.
- Quantity-weighted average purchase cost when complete.
- Product and period aggregation of realized unit economics.
- Chronological absolute and percentage change comparison.
- Ranking by revenue and margin using disclosed thresholds.

## Disallowed Behavior

- Margin analysis without cost basis.
- Inventing cost, target margin, price elasticity, competitor price, tax treatment, or recommended price.
- Using future cost as historical cost.
- Hiding discounts, returns, or incomplete cost history.
- Performing authoritative arithmetic outside Code Interpreter.

## Code Interpreter Execution Rules

Use Code Interpreter to match dated costs, compute realized selling price, unit margin, margin percent, period comparisons, and rankings. Emit row-level warnings for unmatched costs and exclude those rows from authoritative margin totals rather than fabricating a basis.

## Output Contract

```json
{
  "analysisType": "margin-analysis",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "costBasis": "string",
    "products": [{
      "productId": "string",
      "revenue": 0,
      "sellingPrice": 0,
      "purchaseCost": 0,
      "unitMargin": 0,
      "marginPercent": 0,
      "sellingBelowCost": false,
      "purchaseCostChangePercent": null,
      "marginChangePercent": null,
      "priceKeepingPaceWithCost": null
    }],
    "unmatchedCostProductIds": []
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: cost basis is ambiguous in a way that materially changes the requested decision, or an explicit target is required.
- `return_warning_and_continue_with_fallback`: some products lack cost history; exclude them and report partial coverage when other products remain valid.
- `stop_and_return_insufficient_data`: no product has a valid purchase-cost basis or sales-to-product mapping.

## Example Requests

- "Which products am I selling below cost?"
- "Have my margins worsened since supplier prices increased?"
- "Which high-revenue items have the weakest margins?"

## Example Structured Outputs

```json
{
  "analysisType": "margin-analysis",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "costBasis": "latest purchase cost at or before sale",
    "products": [{"productId": "p-2", "revenue": 96000, "sellingPrice": 120, "purchaseCost": 104, "unitMargin": 16, "marginPercent": 0.1333, "sellingBelowCost": false, "purchaseCostChangePercent": 0.0947, "marginChangePercent": -0.18, "priceKeepingPaceWithCost": false}],
    "unmatchedCostProductIds": []
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": ["sale-7", "purchase-4"]
}
```
