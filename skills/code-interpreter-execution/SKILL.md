---
name: code-interpreter-execution
description: Dynamically implement approved FinFine Pro analytical rules in isolated AgentCore Code Interpreter Python and return traceable structured JSON without inventing financial logic.
---

# Code Interpreter Execution

## Purpose

Define the controlled execution contract for authoritative analytics arithmetic in AgentCore Code Interpreter.

## When to Use

Use for every material FinFine Pro analytics calculation and for non-trivial batch validation requested by another skill.

## When Not to Use

Do not use to choose financial logic, browse the public internet, install packages, access arbitrary tenant data, persist results, or replace missing business inputs with fabricated values.

## Required Inputs

- Selected domain skill and `calculationVersion`.
- Validated canonical input objects, `merchantId`, `asOf`, and analysis horizon.
- Exact formulas, allowed methods, fallback rules, output fields, and validation rules from the invoking skill.
- Explicit merchant assumptions and source record IDs.

## Optional Inputs

- Random seed when an approved method is stochastic.
- Resource limits and temporary output-file requirements.
- Prior compatible structured results when the invoking skill permits reuse.

## Input Validation Rules

1. Refuse mixed-merchant inputs and undeclared data sources.
2. Verify all required inputs have passed `analytics-data-contract` or have an explicitly permitted fallback.
3. Verify the requested package is approved before importing it.
4. Reject code requests that leave business formulas, priority rules, or assumptions unspecified.
5. Validate dates, numeric finiteness, enums, and source traceability before calculation.

## Freshness / Reuse Rules

- Execute against the latest validated inputs selected by the orchestrator.
- Reuse prior execution only when calculation version, code-defining rules, sources, `asOf`, horizon, and assumptions are identical.
- Never reuse temporary artifacts as authoritative inputs after their execution context ends.

## Financial Logic / Analytical Rules

- Implement exactly the invoking skill's formulas, method eligibility rules, missing-data behavior, and output contract.
- Keep confirmed values, expected values, and assumptions distinct in variables and output.
- Use deterministic operations where possible and stable ordering for equally ranked results.
- Treat Code Interpreter output as provisional until `validation-and-uncertainty` completes post-calculation checks.

## Allowed Methods

- Python standard library.
- `pandas`, `numpy`, `scipy`, `PuLP`, and OR-Tools.
- Other packages only when explicitly approved by the governing skill or runtime policy.
- In-memory data transformation, statistical calculation, optimization, and temporary artifacts necessary for the current execution.

## Disallowed Behavior

- Installing dependencies or accessing the public internet.
- Cross-tenant or arbitrary merchant data access.
- Direct writes to persistent storage.
- Redefining formulas, category mappings, weights, or fallback behavior.
- Fabricating values to make code run.
- Returning prose instead of the required structured JSON.
- Swallowing exceptions, partial failures, or convergence problems.

## Code Interpreter Execution Rules

1. Construct an explicit input payload and validate it before computation.
2. Import only approved packages and avoid network-capable operations.
3. Implement the invoking skill's method and record which allowed method was used.
4. Handle empty frames, missing columns, invalid dates, divide-by-zero, non-finite output, optimization infeasibility, and runtime exceptions explicitly.
5. Run calculation-specific sanity checks before serialization.
6. Serialize valid JSON matching the shared result contract; convert library-specific numeric and date types to JSON-safe primitives.
7. Include actual `sourceRecordIds`, explicit assumptions, warnings, and method metadata inside `results` where useful.
8. Clean up temporary files and in-memory secrets after output is produced.

## Output Contract

```json
{
  "analysisType": "code-interpreter-execution",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "status": "success|partial|failed",
    "domainAnalysisType": "string",
    "methodUsed": "string",
    "domainResult": {},
    "validationChecks": []
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

The `domainResult` must itself conform to the invoking skill's `results` shape. A failed execution must not include fabricated domain values.

## Warnings / Error Conditions

- `ask_for_missing_input`: required execution input or an explicit assumption is absent.
- `return_warning_and_continue_with_fallback`: the invoking skill defines the exact fallback and the code records its use.
- `stop_and_return_insufficient_data`: no allowed method can run safely.
- Return `status: "failed"` for exceptions, invalid output, package violations, infeasible optimization, or cleanup failure that could affect trustworthiness.

## Example Requests

- "Execute the 30-day cash projection using the cashflow skill's daily formula."
- "Run weighted moving-average demand forecasts for the validated products."
- "Solve the payable schedule under the defined cash-buffer and priority constraints."

## Example Structured Outputs

```json
{
  "analysisType": "code-interpreter-execution",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "status": "success",
    "domainAnalysisType": "cashflow-projection",
    "methodUsed": "daily deterministic projection",
    "domainResult": {"lowestProjectedBalance": 310000},
    "validationChecks": ["all daily balances finite", "source IDs preserved"]
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": ["cash-9", "obl-17"]
}
```
