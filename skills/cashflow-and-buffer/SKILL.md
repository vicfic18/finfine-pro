---
name: cashflow-and-buffer
description: Project FinFine Pro merchant cash balances, liquidity runway, minimum-buffer breaches, shortfalls, and reserve needs from validated cash-flow inputs.
---

# Cash Flow and Buffer

## Purpose

Produce a date-by-date cash projection and identify when the merchant may reach zero cash or breach the configured minimum cash buffer.

## When to Use

Use for runway, liquidity, reserve, payment-capacity, purchase-affordability, or minimum-buffer questions, and as a constraint provider for supplier and scenario analysis.

## When Not to Use

Do not use to forecast product demand, calculate margins, choose suppliers by itself, infer unrecorded inflows, or provide accounting statements.

## Required Inputs

- Current `CashPositionSnapshot`.
- Scheduled or explicitly expected inflows from `ExpectedReceivable`, `TransactionRecord`, or `ObligationRecord`.
- Scheduled outflows from `ObligationRecord`, `RecurringExpense`, purchase plans, or explicit scenario inputs.
- `MerchantFinancialSettings.minimumCashBuffer` and `bufferRuleType`.
- `asOf` and projection horizon.

If `DAYS_OF_EXPENSE` is selected but the settings do not contain a monetary `minimumCashBuffer` already resolved from that rule, ask for an explicit monetary buffer or stop; do not invent a conversion rule.

## Optional Inputs

- Open purchase orders and planned inventory purchases.
- Expected-receivable probability.
- Explicit timing ranges for uncertain inflows or outflows.
- Low/base/high scenario assumptions from another skill.

## Input Validation Rules

1. Require one current cash snapshot and reconcile `totalLiquidCash` to `bankBalance + cashOnHand` when both components exist.
2. Include only cash flows dated after `asOf` and on or before the horizon end; separately flag overdue unpaid obligations.
3. Reject duplicate cash-flow records and mixed merchant IDs.
4. Require non-negative amounts and valid inflow/outflow direction.
5. Do not combine expected receivables with confirmed inflows without labeling the distinction.
6. Require a valid absolute buffer or a fully specified days-of-expense buffer basis.

## Freshness / Reuse Rules

- Use the latest cash snapshot available as of the analysis date; a snapshot predating material transactions is stale.
- Reuse scheduled obligations, recurring expenses, and receivables until paid, cancelled, disputed, corrected, or past their relevant date.
- Recompute whenever cash position, cash-flow timing, horizon, buffer setting, or scenario assumptions change.

## Financial Logic / Analytical Rules

For each date `t` in chronological order, calculate:

```text
projected_balance[t] =
  previous_balance
  + expected_inflows[t]
  - supplier_payments[t]
  - fixed_expenses[t]
  - inventory_purchases[t]
  - other_outflows[t]
```

- Start `previous_balance` at `CashPositionSnapshot.totalLiquidCash`.
- Expand recurring expenses to dated outflows within the horizon using their stated frequency and due date. If a monthly due date is absent, ask for it or exclude the expense with a warning; do not choose a day.
- Produce a confirmed-cash path using confirmed inflows only. Include uncertain receivables only in a separately labeled expected or scenario path unless the merchant explicitly approves another treatment.
- `daysToZero` is the number of calendar days from `asOf` to the first date with projected balance below zero; otherwise `null`.
- `daysToMinimumBuffer` is the number of calendar days to the first date below the buffer; otherwise `null`.
- `lowestProjectedBalance` is the minimum daily closing balance.
- `cashShortfallAmount = max(0, -lowestProjectedBalance)`.
- `requiredReserveAmount = max(0, minimumCashBuffer - lowestProjectedBalance)`.

## Allowed Methods

- Deterministic daily cash-flow projection.
- Separate low/base/high paths supplied by forecasting or scenario skills.
- Explicit probability-weighted receivables only when probability is present and the output remains labeled as expected rather than confirmed.
- Calendar expansion of validated recurring expenses.

## Disallowed Behavior

- Inventing inflows, due dates, expense timing, receivable probability, or buffer values.
- Netting uncertain inflows into confirmed cash.
- Hiding overdue obligations or negative balances.
- Recalculating demand, inventory, or margin logic owned by another skill.
- Performing authoritative arithmetic outside Code Interpreter.

## Code Interpreter Execution Rules

Use `code-interpreter-execution` to create the daily cash-flow calendar, deduplicate traceable inputs, compute every balance and required output, and serialize JSON. Preserve record-level source IDs and path labels. Return no numeric projection if the opening cash position or minimum buffer is unusable.

## Output Contract

```json
{
  "analysisType": "cashflow-projection",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "horizonEnd": "YYYY-MM-DD",
    "minimumCashBuffer": 0,
    "projectionPath": [],
    "daysToZero": null,
    "daysToMinimumBuffer": null,
    "lowestProjectedBalance": 0,
    "firstBufferBreachDate": null,
    "cashShortfallAmount": 0,
    "requiredReserveAmount": 0,
    "scenarioPaths": {}
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: opening cash, buffer, horizon, or a required undated material cash flow is missing.
- `return_warning_and_continue_with_fallback`: omit an optional uncertain receivable or produce a confirmed-only path while labeling reduced coverage.
- `stop_and_return_insufficient_data`: no valid current cash position, no valid buffer, or required cash-flow direction cannot be resolved.

## Example Requests

- "How many days until I go below my ₹2 lakh buffer?"
- "Can I pay this supplier next Friday without risking payroll?"
- "Show confirmed and expected cash for the next 30 days."

## Example Structured Outputs

```json
{
  "analysisType": "cashflow-projection",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "horizonEnd": "2026-10-19",
    "minimumCashBuffer": 200000,
    "projectionPath": [{"date": "2026-09-19", "closingBalance": 410000}, {"date": "2026-10-02", "closingBalance": 180000}],
    "daysToZero": null,
    "daysToMinimumBuffer": 13,
    "lowestProjectedBalance": 180000,
    "firstBufferBreachDate": "2026-10-02",
    "cashShortfallAmount": 0,
    "requiredReserveAmount": 20000,
    "scenarioPaths": {}
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": ["cash-1", "obl-5", "expense-3"]
}
```
