---
name: scenario-what-if-analysis
description: Evaluate explicit FinFine Pro merchant what-if decisions by composing existing domain skills into low, base, and high financial outcomes without inventing uplift.
---

# Scenario What-If Analysis

## Purpose

Model the incremental financial consequences of a hypothetical merchant decision while reusing the authoritative logic of the affected domain skills.

## When to Use

Use for proposed purchases, equipment, inventory expansion, price or supplier changes, payment timing, or other hypothetical decisions with measurable financial effects.

## When Not to Use

Do not use for a historical fact-only analysis or when the user expects the skill to invent revenue uplift, demand response, operating cost, or financing terms.

## Required Inputs

- A precisely defined baseline and proposed scenario.
- All known upfront costs, timing, `asOf`, and scenario horizon.
- Fresh outputs or validated inputs for every affected domain skill.
- Explicit revenue/demand uplift assumptions, or permission to present an assumption range instead of an asserted uplift.

## Optional Inputs

- Incremental fixed and variable operating expenses.
- Financing terms, residual value, ramp-up period, useful life, inventory mix, and working-capital timing.
- Merchant-supplied low/base/high assumptions.

## Input Validation Rules

1. Separate baseline inputs from incremental scenario changes.
2. Require amount, date, and recurrence for each cost.
3. Require explicit units and time basis for uplift assumptions.
4. Do not treat an equipment purchase as revenue-generating without a supplied demand or revenue mechanism.
5. Validate that scenario values do not double-count baseline expenses, inventory, revenue, or cash flows.
6. Ensure every reused domain result is current, version compatible, and based on the same merchant and compatible horizon.

## Freshness / Reuse Rules

- Reuse fresh validated domain results for the unchanged baseline.
- Recompute every affected domain result when a scenario changes cash timing, demand, inventory, prices, costs, or supplier terms.
- Do not reuse a prior scenario result when any scenario assumption changes.

## Financial Logic / Analytical Rules

- Calculate only incremental effects relative to the baseline.
- Use `sales-demand-forecasting` for demand scenarios, `inventory-and-stockout` for inventory effects, `margin-and-pricing` for unit economics, `cashflow-and-buffer` for cash impact, and `supplier-and-payables-optimization` for constrained supplier/payment choices.
- Do not duplicate or modify formulas owned by those skills.
- `incremental gross profit = incremental revenue - incremental cost of goods sold`, only when both terms have an explicit validated basis.
- Added fixed or operating expense equals only the scenario-specific expense over the stated period.
- Inventory capital required uses validated purchase cost for incremental inventory.
- Lowest projected cash balance comes from the scenario cash-flow path, not a separate mental calculation.
- `payback period` is the first elapsed period when cumulative incremental net cash flow is non-negative after the initial investment. Return `null` if it does not occur within the horizon or cash flows are incomplete.
- If uplift is unknown, ask for it or show clearly labeled low/base/high outcomes using explicit proposed assumptions. Do not present those assumptions as forecasts.

## Allowed Methods

- Baseline-versus-scenario comparison.
- Low/base/high scenario analysis using explicit assumptions.
- Sensitivity tables over merchant-approved ranges.
- Composition of validated outputs from relevant domain skills.

## Disallowed Behavior

- Inventing revenue uplift, demand elasticity, cost savings, operating expenses, useful life, financing, or residual value.
- Reimplementing domain formulas with conflicting definitions.
- Using a single precise result when uncertainty requires scenarios.
- Mixing baseline and incremental amounts.
- Performing authoritative arithmetic outside Code Interpreter.

## Code Interpreter Execution Rules

Use Code Interpreter to assemble baseline and scenario cash-flow series, consume validated domain outputs, calculate incremental metrics and payback, and verify reconciliation. Record every assumption and domain result version used. If an affected domain calculation fails, mark dependent scenario outputs unavailable.

## Output Contract

```json
{
  "analysisType": "scenario-analysis",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "baseline": {},
    "scenarios": [{
      "name": "low|base|high",
      "incrementalRevenue": null,
      "incrementalGrossProfit": null,
      "addedOperatingExpense": null,
      "inventoryCapitalRequired": null,
      "cashFlowImpact": null,
      "lowestProjectedCashBalance": null,
      "stockTurnoverImpact": null,
      "paybackPeriodDays": null
    }],
    "dependentAnalysisVersions": {}
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: material scenario cost, timing, or uplift is absent and no approved scenario range is available.
- `return_warning_and_continue_with_fallback`: show outcomes over clearly labeled explicit ranges while leaving unavailable dependent metrics `null`.
- `stop_and_return_insufficient_data`: baseline cannot be established or a required domain result is unsafe.

## Example Requests

- "What happens if I spend ₹1,00,000 on a freezer and ₹35,000 on inventory?"
- "Compare opening a second counter under low, base, and high sales uplift."
- "What if I delay a non-statutory supplier payment by seven days?"

## Example Structured Outputs

```json
{
  "analysisType": "scenario-analysis",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "baseline": {"lowestProjectedCashBalance": 310000},
    "scenarios": [{"name": "base", "incrementalRevenue": 180000, "incrementalGrossProfit": 54000, "addedOperatingExpense": 12000, "inventoryCapitalRequired": 35000, "cashFlowImpact": -93000, "lowestProjectedCashBalance": 217000, "stockTurnoverImpact": 0.2, "paybackPeriodDays": null}],
    "dependentAnalysisVersions": {"cashflow-projection": "1.0.0", "margin-analysis": "1.0.0"}
  },
  "assumptions": ["Merchant supplied base incremental revenue of ₹180,000 over the horizon."],
  "warnings": ["Payback does not occur within the stated horizon."],
  "dataQuality": "medium",
  "confidence": "medium",
  "sourceRecordIds": ["cash-1", "purchase-4"]
}
```
