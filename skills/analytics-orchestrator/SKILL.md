---
name: analytics-orchestrator
description: Route FinFine Pro merchant analytics requests through validated data, the required domain skills, Code Interpreter execution, result validation, and merchant-friendly explanation.
---

# Analytics Orchestrator

## Purpose

Classify a merchant request and build the smallest complete analytics workflow that answers it. Ensure that structured data validation precedes analytics, authoritative arithmetic runs in AgentCore Code Interpreter, and validation precedes explanation.

## When to Use

Use for every FinFine Pro analytics request, including cash-flow, demand, inventory, margin, supplier, payable, scenario, and cross-domain opportunity questions.

## When Not to Use

Do not use for document ingestion, supplier communications, localization, notifications, scheduling, infrastructure design, persistence design, or standalone non-analytics conversation.

## Required Inputs

- The merchant's request.
- `merchantId` and an effective `asOf` date.
- Available reusable merchant objects conforming to the logical schemas defined by `analytics-data-contract`.

## Optional Inputs

- Requested forecast horizon or scenario horizon.
- Explicit merchant assumptions and constraints.
- Previously validated domain results that remain fresh enough for the current request.

## Input Validation Rules

1. Always invoke `analytics-data-contract` before a domain calculation.
2. Confirm all records belong to the same `merchantId`; mixed-merchant inputs must stop execution.
3. Treat an ambiguous request as a routing ambiguity, not permission to invent objectives. Ask a focused question when the selected domain would materially change the answer.
4. Invoke `merchant-intake` only for data identified as missing, stale, incomplete, or changed.
5. Pass only validated structured inputs and explicit assumptions to domain skills.

## Freshness / Reuse Rules

- Reuse validated merchant data and prior results when their effective dates and horizons satisfy the domain skill's freshness rules.
- Do not request an input again solely because it was not supplied in the current message.
- Recompute when source records, merchant constraints, `asOf`, horizon, or calculation version have changed.
- Never reuse a prior narrative as a numeric source; reuse only structured validated results.

## Financial Logic / Analytical Rules

Map intent to skills as follows:

- Liquidity, runway, reserve, affordability: `cashflow-and-buffer`.
- Demand or future sales: `sales-demand-forecasting`.
- coverage, reorder, stockout, dead stock, excess stock: `sales-demand-forecasting` plus `inventory-and-stockout` unless a fresh validated demand forecast exists.
- Unit economics or price adequacy: `margin-and-pricing`.
- Supplier comparison, purchase allocation, or payment ordering: `supplier-and-payables-optimization`, plus cash-flow and inventory skills when their constraints are relevant.
- Hypothetical decisions: `scenario-what-if-analysis` plus each affected domain skill.
- Broad risk/opportunity review: relevant domain skills followed by `opportunity-detector`.

Every route must also include `analytics-data-contract`, `code-interpreter-execution`, `validation-and-uncertainty`, and `financial-explanation`.

## Allowed Methods

- Intent classification from the request and available structured context.
- Loading multiple domain skills when the question crosses domains.
- Focused clarification for materially ambiguous intent or missing required input.
- Reuse of fresh, calculation-version-compatible structured results.

## Disallowed Behavior

- Performing final analytics calculations in the orchestrator.
- Inventing merchant data, financial logic, assumptions, or priority rules.
- Passing unvalidated free text as a numeric input.
- Skipping Code Interpreter, validation, or explanation.
- Loading unrelated skills or the explicitly out-of-scope skills.
- Treating transaction and obligation categories as interchangeable.

## Code Interpreter Execution Rules

- Send each domain calculation through `code-interpreter-execution`.
- Include the selected skill names, calculation version, validated objects, explicit assumptions, `asOf`, and requested horizon.
- Do not ask Code Interpreter to choose business logic; the selected domain skills define it.
- If execution fails, return a structured execution warning and do not fabricate results.

## Output Contract

Return a routing plan with:

```json
{
  "analysisType": "analytics-routing",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "selectedSkills": [],
    "executionOrder": [],
    "requiredInputsPresent": [],
    "missingInputs": [],
    "needsMerchantIntake": false
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: intent is ambiguous or a required merchant choice cannot be inferred safely.
- `return_warning_and_continue_with_fallback`: a domain skill explicitly permits a conservative fallback.
- `stop_and_return_insufficient_data`: tenant identity is inconsistent, required inputs lack an allowed fallback, or safe routing is impossible.

## Example Requests

- "Will I run out of sunflower oil next month?"
- "Can I buy another freezer without going below my cash buffer?"
- "Which supplier should I use and which bills should I pay first?"

## Example Structured Outputs

```json
{
  "analysisType": "analytics-routing",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "selectedSkills": ["sales-demand-forecasting", "inventory-and-stockout"],
    "executionOrder": ["analytics-data-contract", "sales-demand-forecasting", "inventory-and-stockout", "code-interpreter-execution", "validation-and-uncertainty", "financial-explanation"],
    "requiredInputsPresent": ["SalesRecord", "InventorySnapshot", "ProductMaster"],
    "missingInputs": ["SupplierProfile.leadTimeDays"],
    "needsMerchantIntake": true
  },
  "assumptions": [],
  "warnings": ["Lead time is required for a complete reorder-point result."],
  "dataQuality": "medium",
  "confidence": "high",
  "sourceRecordIds": ["sale-101", "inventory-22"]
}
```
