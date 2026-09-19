---
name: opportunity-detector
description: Combine validated FinFine Pro domain results to identify evidence-backed merchant risks and opportunities without duplicating calculations or inventing recommendations.
---

# Opportunity Detector

## Purpose

Find actionable cross-domain risks and opportunities by composing existing validated analytical results and preserving their evidence and uncertainty.

## When to Use

Use for broad business reviews or when multiple domain results may reveal stockout risk, margin deterioration, dead stock, supplier opportunities, excess inventory, cash-buffer risk, payment stress, or declining demand.

## When Not to Use

Do not use as a substitute for domain calculations, to generate generic business advice, or when no validated domain evidence is available.

## Required Inputs

- At least one validated structured result from a relevant domain skill.
- `merchantId`, `asOf`, and the review horizon.
- Validation metadata, calculation version, and source record IDs for every input result.

## Optional Inputs

- Merchant priorities and constraints.
- Multiple scenario results.
- Fresh supplier, cash-flow, margin, demand, and inventory results for cross-domain confirmation.

## Input Validation Rules

1. Accept only results that passed `validation-and-uncertainty`.
2. Require compatible merchant, effective dates, horizons, and calculation versions.
3. Reject narrative-only claims without structured evidence.
4. Preserve each input's warnings, confidence, assumptions, and source IDs.
5. Do not combine results whose scopes conflict without labeling the mismatch.

## Freshness / Reuse Rules

- Reuse only domain results that remain fresh under their own skill rules.
- Rerun affected domains before detection when source data or merchant constraints changed.
- An opportunity expires when its supporting risk, price, balance, obligation, inventory, or forecast is superseded.

## Financial Logic / Analytical Rules

Detect only the following evidence-backed classes:

- `stockout-risk`: product has a validated likely stockout or below-reorder-point result.
- `margin-deterioration`: validated comparable margin declined.
- `dead-stock`: validated positive dead-stock quantity.
- `supplier-opportunity`: a validated supplier comparison shows a feasible improvement under applicable constraints.
- `excess-inventory`: validated excess quantity or value is positive.
- `cash-buffer-risk`: a validated cash path breaches the minimum buffer.
- `payment-stress`: validated obligations cannot all be met within cash and due-date constraints.
- `declining-demand`: the demand skill reports a validated decline based on its method.

For each item, state the evidence, affected object, estimated financial impact only if already calculated by a domain skill, time window, confidence, and a bounded next action. Rank by explicit merchant priority or by disclosed severity and time-to-impact; do not invent a hidden composite score.

## Allowed Methods

- Rule-based composition of validated domain fields.
- Deduplication of opportunities sharing the same product, obligation, or cause.
- Evidence-strength and urgency labeling derived from input confidence and dates.
- Cross-skill confirmation, such as margin weakness plus excess inventory.

## Disallowed Behavior

- Recalculating cash, forecast, stock, margin, supplier, or scenario metrics.
- Inventing savings, revenue, causal explanations, or priority weights.
- Turning a low-confidence signal into a definitive recommendation.
- Emitting vague advice without evidence and traceable sources.

## Code Interpreter Execution Rules

Use Code Interpreter only for structured joining, filtering, sorting, and deduplication of validated domain results. Do not reproduce domain arithmetic. Preserve exact numeric values and source IDs from the inputs.

## Output Contract

```json
{
  "analysisType": "opportunity-detection",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "opportunities": [{
      "type": "string",
      "affectedEntityIds": [],
      "evidence": [],
      "financialImpact": null,
      "timeToImpactDays": null,
      "severity": "high|medium|low",
      "recommendedNextAction": "string",
      "supportingAnalysisTypes": []
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

- `ask_for_missing_input`: a requested ranking depends on an unspecified merchant priority.
- `return_warning_and_continue_with_fallback`: only some relevant domain results are available; return a clearly scoped partial review.
- `stop_and_return_insufficient_data`: no validated evidence supports detection.

## Example Requests

- "What are the biggest risks and opportunities in my shop this month?"
- "Find products with both weak margins and excess stock."
- "Show any payment stress caused by upcoming reorders."

## Example Structured Outputs

```json
{
  "analysisType": "opportunity-detection",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "opportunities": [{"type": "cash-buffer-risk", "affectedEntityIds": ["m-1"], "evidence": ["Projected balance ₹180,000 versus ₹200,000 buffer on 2026-10-02."], "financialImpact": 20000, "timeToImpactDays": 13, "severity": "high", "recommendedNextAction": "Review the dated outflows causing the first breach.", "supportingAnalysisTypes": ["cashflow-projection"]}]
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": ["cash-1", "obl-5"]
}
```
