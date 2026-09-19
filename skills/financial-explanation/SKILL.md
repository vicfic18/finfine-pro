---
name: financial-explanation
description: Turn validated FinFine Pro analytical results into clear merchant-friendly language while preserving exact numbers, assumptions, warnings, and uncertainty without recalculation.
---

# Financial Explanation

## Purpose

Explain validated analytics in practical merchant language without changing numbers or introducing unsupported conclusions.

## When to Use

Use only after `validation-and-uncertainty` returns `pass` or `pass_with_warnings` for a structured analytical result.

## When Not to Use

Do not explain blocked results as conclusions, perform arithmetic, repair missing values, create new forecasts, or add recommendations unsupported by the validated result.

## Required Inputs

- The complete validated structured result.
- Validation status, assumptions, warnings, data quality, confidence, source IDs, `asOf`, and analysis horizon.
- The merchant's question and preferred language if available.

## Optional Inputs

- Merchant business context already present in validated data.
- Requested level of detail.
- A validated list of recommended next actions from the domain result or `opportunity-detector`.

## Input Validation Rules

1. Accept only a validation status of `pass` or `pass_with_warnings`.
2. Verify every number to be stated appears in the validated result.
3. Preserve units, dates, signs, scenario labels, and distinction between facts, estimates, and assumptions.
4. Verify that any recommended action is directly supported by a validated domain field.
5. If the result is partial, state its coverage and unavailable fields.

## Freshness / Reuse Rules

- Explain the exact validated result supplied for the current request.
- Do not reuse narrative from an older analysis when inputs, result version, `asOf`, horizon, assumptions, or warnings changed.
- Rewording is allowed; importing old numbers or conclusions is not.

## Financial Logic / Analytical Rules

- Perform no new financial logic or arithmetic.
- Lead with the direct answer, followed by the most decision-relevant evidence.
- Label recorded or confirmed values as facts, modeled values as estimates, and user- or rule-supplied values as assumptions.
- State the effective date and horizon whenever they affect interpretation.
- Explain why a risk or opportunity was detected using only validated evidence.
- Carry all material warnings and clearly explain what low or medium confidence means for the decision.
- Format INR with `₹` and Indian digit grouping for display, such as `₹1,25,000`; retain the exact machine-readable value in the structured result. If display rounding is used, label it as approximate and never replace the underlying value.

## Allowed Methods

- Plain-language summarization of validated fields.
- Reordering existing evidence by relevance to the merchant's question.
- Formatting dates, percentages, durations, and INR values without changing their meaning.
- Presenting validated low/base/high scenarios and bounded next actions.

## Disallowed Behavior

- Recalculating, correcting, overriding, averaging, or extrapolating numbers.
- Omitting a material assumption, warning, low-confidence label, or partial-coverage limitation.
- Introducing causal claims, savings, forecasts, or advice unsupported by the validated output.
- Converting expected values into confirmed values.
- Hiding a buffer breach, stockout, below-cost sale, infeasible plan, or validation caveat.

## Code Interpreter Execution Rules

Do not use Code Interpreter to recalculate or transform analytical values. If formatting a large structured result requires code, it may only map existing fields to presentation strings and must preserve the original validated JSON unchanged.

## Output Contract

Return the shared result contract with the exact validated analytics plus explanation fields:

```json
{
  "analysisType": "financial-explanation",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "validatedAnalysisType": "string",
    "validatedResults": {},
    "directAnswer": "string",
    "keyEvidence": [],
    "facts": [],
    "estimates": [],
    "recommendedNextActions": []
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: the requested language or presentation choice is essential and unavailable; otherwise use clear English.
- `return_warning_and_continue_with_fallback`: optional context is absent; explain the validated result and its limitations.
- `stop_and_return_insufficient_data`: validation status is `blocked`, the result lacks required metadata, or a requested conclusion is unsupported.

## Example Requests

- "Explain this cash forecast in simple terms."
- "Tell me which stockout risks need attention first."
- "Summarize the supplier decision and its uncertainty for the shop owner."

## Example Structured Outputs

```json
{
  "analysisType": "financial-explanation",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "validatedAnalysisType": "cashflow-projection",
    "validatedResults": {"minimumCashBuffer": 200000, "lowestProjectedBalance": 180000, "firstBufferBreachDate": "2026-10-02", "requiredReserveAmount": 20000},
    "directAnswer": "Your projected cash falls ₹20,000 below your ₹2,00,000 minimum buffer on 2 October 2026.",
    "keyEvidence": ["The lowest validated projected balance is ₹1,80,000."],
    "facts": ["Your configured minimum cash buffer is ₹2,00,000."],
    "estimates": ["The projected lowest balance is ₹1,80,000."],
    "recommendedNextActions": ["Review the dated outflows included before 2 October."]
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": ["cash-1", "obl-5"]
}
```
