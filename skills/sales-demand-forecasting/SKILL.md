---
name: sales-demand-forecasting
description: Forecast FinFine Pro product demand with bounded daily or weekly methods, conservative fallbacks, volatility classification, and low/base/high scenarios.
---

# Sales Demand Forecasting

## Purpose

Estimate future unit demand by product without implying precision that the available sales history cannot support.

## When to Use

Use for product-demand forecasts, sales-volume outlooks, stock planning, reorder analysis, scenarios involving future demand, and declining-demand detection.

## When Not to Use

Do not forecast cash, revenue uplift without explicit assumptions, prices, margins, or demand for a product with no identifiable sales basis.

## Required Inputs

- Validated product-level `SalesRecord` history and product identity from `ProductMaster`.
- Forecast horizon in days or weeks.
- `asOf` date.

## Optional Inputs

- Channel filters.
- Returns and discounts.
- Known closures, promotions, or seasonality markers supplied by the merchant.
- Requested aggregation interval and prior validated forecast.

## Input Validation Rules

1. Sort by sale date, remove no records silently, and flag duplicate sale IDs.
2. Use `quantity - returnQuantity` when returns are present; flag negative resulting net units.
3. Fill missing calendar periods with zero only when the business was known to be open and reporting was complete; otherwise treat them as unknown.
4. Require stable `productId` mapping and flag name mismatches.
5. Measure history length, number of observed periods, missingness, zero-demand share, and outliers before selecting a method.
6. Exclude periods after `asOf` and do not extrapolate beyond the requested horizon.

## Freshness / Reuse Rules

- Use sales history through the latest complete reporting period at or before `asOf`.
- Reuse a prior forecast only when its horizon still covers the requested dates and sources, product mapping, method version, and explicit assumptions are unchanged.
- Recompute after new sales, corrected returns, changed aggregation, or changed scenario assumptions.

## Financial Logic / Analytical Rules

- Forecast units, not revenue, unless a separate skill supplies price assumptions.
- Prefer daily aggregation for horizons up to 30 days when daily history is sufficiently complete; otherwise use weekly aggregation.
- With at least two complete seasonal cycles and detectable repeat structure, exponential smoothing may include the corresponding seasonality.
- Without supported seasonality, compare weighted moving average and non-seasonal exponential smoothing by rolling-origin validation using MAE. Select the lower-MAE method; on a material tie, use the simpler weighted moving average.
- With fewer than 28 complete daily periods or 8 complete weekly periods, do not fit seasonality. Use a weighted moving average over observed complete periods and mark confidence low or medium according to missingness and volatility.
- With fewer than 14 complete daily periods or 4 complete weekly periods, do not present a precise point forecast. Return scenario demand based on explicitly disclosed recent observed rates, or stop if no observed demand basis exists.
- Produce low/base/high totals. Use empirical forecast-error bounds when backtesting is possible; otherwise derive scenarios from observed rate variability and disclose the fallback.
- Classify volatility using a reported coefficient of variation or another explicitly calculated dispersion measure; include the metric and thresholds used in `results` rather than applying an unexplained label.

## Allowed Methods

- Daily or weekly aggregation.
- Weighted moving averages with disclosed window and weights.
- Non-seasonal or seasonal exponential smoothing when history supports it.
- Seasonality checks based on observed repeated patterns.
- Rolling-origin validation using MAE.
- Low/base/high scenarios and observed-data conservative fallbacks.

## Disallowed Behavior

- Forecasting from product names, general market knowledge, or fabricated demand.
- Assuming promotions, holidays, growth, closures, or uplift not present in data or explicit assumptions.
- Using a seasonal method without enough complete cycles.
- Presenting scenario fallbacks as precise forecasts.
- Performing authoritative arithmetic outside Code Interpreter.

## Code Interpreter Execution Rules

Use Code Interpreter to aggregate net units, profile completeness, test eligible methods, run rolling validation, calculate scenarios and volatility, and emit product-level JSON. Record method, window, weights or smoothing settings, error metric, and fallback reason for each product.

## Output Contract

```json
{
  "analysisType": "demand-forecast",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "horizonEnd": "YYYY-MM-DD",
    "aggregation": "daily|weekly",
    "products": [{
      "productId": "string",
      "method": "string",
      "forecastUnits": {"low": 0, "base": 0, "high": 0},
      "volatility": {"classification": "low|medium|high", "metric": 0, "thresholds": "string"},
      "validationMAE": null
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

- `ask_for_missing_input`: horizon, product identity, reporting completeness, or a material closure/promotion assumption is required.
- `return_warning_and_continue_with_fallback`: history is short but contains an observed-rate basis; return scenarios and lower confidence.
- `stop_and_return_insufficient_data`: no usable product-level sales history or no basis for a demand scenario.

## Example Requests

- "How much basmati rice will I likely sell in the next four weeks?"
- "Give me low, base, and high demand for each SKU."
- "Is demand for cooking oil declining?"

## Example Structured Outputs

```json
{
  "analysisType": "demand-forecast",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "horizonEnd": "2026-10-17",
    "aggregation": "weekly",
    "products": [{"productId": "p-7", "method": "weighted-moving-average", "forecastUnits": {"low": 72, "base": 84, "high": 99}, "volatility": {"classification": "medium", "metric": 0.31, "thresholds": "reported model thresholds"}, "validationMAE": 4.2}]
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "medium",
  "sourceRecordIds": ["sale-1", "sale-2", "sale-3"]
}
```
