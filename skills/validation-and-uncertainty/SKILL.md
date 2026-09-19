---
name: validation-and-uncertainty
description: Validate FinFine Pro analytics before and after calculation, block unsafe results, and assign explicit data-quality, confidence, assumption, and warning metadata.
---

# Validation and Uncertainty

## Purpose

Check inputs and calculated results for correctness, completeness, plausibility, traceability, and uncertainty before any merchant-facing explanation is generated.

## When to Use

Use before every analytical calculation and again after Code Interpreter produces a result.

## When Not to Use

Do not use to invent corrections, replace a domain skill, suppress inconvenient warnings, or rewrite validated numeric results.

## Required Inputs

- Selected analysis type and domain skill version.
- Validated canonical inputs and pre-calculation validation report.
- Code Interpreter output for post-calculation validation.
- `merchantId`, `asOf`, horizon, assumptions, warnings, and source record IDs.

## Optional Inputs

- Prior comparable results for anomaly checks.
- Domain-specific tolerances explicitly defined by the invoking skill.
- Merchant clarification for ambiguous records.

## Input Validation Rules

Check at minimum:

- invalid or inconsistent dates;
- negative or impossible quantities and amounts;
- duplicate sales or identifiers;
- missing purchase prices;
- mismatched product IDs and names;
- impossible inventory levels;
- missing supplier lead times;
- sales prices below purchase cost;
- currency inconsistencies;
- insufficient history for forecasting or confidence;
- mixed merchant IDs, unsupported enums, non-finite numbers, and missing source IDs.

Do not automatically treat below-cost sales as invalid; flag them as analytically important unless another inconsistency makes them impossible.

## Freshness / Reuse Rules

- Reuse a validation result only with identical inputs, source IDs, assumptions, calculation version, `asOf`, and horizon.
- Revalidate after any correction, fallback, method change, or domain recomputation.
- Post-calculation validation is mandatory even when pre-calculation quality is high.

## Financial Logic / Analytical Rules

- Verify domain invariants, including: cash roll-forwards reconcile; `cashShortfallAmount` and `requiredReserveAmount` are non-negative; forecast scenario order is low ≤ base ≤ high; stock quantities and reorder results use compatible units; unit margin equals selling price minus purchase cost; margin percent handles zero price safely; optimization respects hard constraints; scenario totals reconcile to their component domain outputs.
- `dataQuality` is `high` when all required inputs are current, valid, traceable, and materially complete; `medium` when limited gaps or staleness use an explicitly allowed fallback without invalidating the principal result; `low` when material gaps, ambiguity, sparse history, or broad staleness substantially limit coverage.
- `confidence` is `high` when method eligibility is satisfied, data quality is high, validation passes, and no material untested assumption drives the result; `medium` when an allowed fallback or moderate uncertainty affects precision; `low` when the result is scenario-only, highly assumption-sensitive, sparse, or materially incomplete but still safe to present.
- Confidence cannot exceed what the weakest material dependency supports. A blocked result has no merchant-facing numeric conclusion even if some fields pass.
- List every assumption explicitly and distinguish merchant-supplied, record-derived, and rule-based assumptions.

## Allowed Methods

- Schema, range, reconciliation, duplicate, referential-integrity, completeness, freshness, and invariant checks.
- Cross-checks against input totals and prior comparable validated results.
- Sensitivity or residual checks when defined by the domain skill.
- Structured severity classification of warnings and blocking errors.

## Disallowed Behavior

- Silently correcting, dropping, clipping, or imputing financial values.
- Raising confidence to make an answer appear decisive.
- Converting a warning into an assumption without authority.
- Recalculating a result with different business logic.
- Allowing impossible inputs or broken hard constraints to proceed.

## Code Interpreter Execution Rules

Use Code Interpreter for reproducible batch checks and numeric reconciliation. Validation code must use approved packages, avoid the internet and persistence, report each failed check, and leave the original result unchanged. If validation fails, return a separate validation result and block explanation of unsafe numeric conclusions.

## Output Contract

```json
{
  "analysisType": "validation-and-uncertainty",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "status": "pass|pass_with_warnings|blocked",
    "validatedAnalysisType": "string",
    "preCalculationChecks": [],
    "postCalculationChecks": [],
    "blockingErrors": [],
    "coverage": {},
    "validatedResult": {}
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

The nested `validatedResult` must preserve the domain result exactly. When status is `blocked`, include no unvalidated numeric conclusion as authoritative.

## Warnings / Error Conditions

- `ask_for_missing_input`: an ambiguity or missing value can safely be resolved by the merchant.
- `return_warning_and_continue_with_fallback`: a domain-defined fallback passes all relevant invariants; lower quality or confidence as warranted.
- `stop_and_return_insufficient_data`: impossible required inputs, broken reconciliation, mixed tenant data, invalid output, unsupported currency, or violated hard constraints.

## Example Requests

- "Validate this demand forecast before explaining it."
- "Check whether the payable optimization respected the cash buffer."
- "Assess the data quality and uncertainty of this stockout result."

## Example Structured Outputs

```json
{
  "analysisType": "validation-and-uncertainty",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "status": "pass_with_warnings",
    "validatedAnalysisType": "stockout-risk",
    "preCalculationChecks": ["inventory quantities non-negative", "product IDs matched"],
    "postCalculationChecks": ["stockout dates follow asOf", "scenario order valid"],
    "blockingErrors": [],
    "coverage": {"productsRequested": 12, "productsValidated": 12, "completeReorderOutputs": 9},
    "validatedResult": {"products": 12}
  },
  "assumptions": ["Base demand scenario used for stockout dates."],
  "warnings": ["Three products lack supplier lead time, so reorder outputs are partial."],
  "dataQuality": "medium",
  "confidence": "medium",
  "sourceRecordIds": ["inventory-22", "sale-1", "supplier-3"]
}
```
