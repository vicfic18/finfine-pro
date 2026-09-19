---
name: supplier-and-payables-optimization
description: Compare FinFine Pro suppliers and optimize purchase or payable choices under explicit cash-buffer, inventory, due-date, penalty, MOQ, and obligation-priority constraints.
---

# Supplier and Payables Optimization

## Purpose

Compare supplier economics and produce a constraint-respecting purchase or payment plan using only explicit terms and the defined obligation priority matrix.

## When to Use

Use for supplier comparison, purchase allocation, payable scheduling, payment stress, credit-term tradeoffs, or constrained purchasing decisions.

## When Not to Use

Do not invent negotiation flexibility, delay statutory obligations, forecast demand independently, or optimize without the cash and inventory constraints required by the request.

## Required Inputs

- Relevant `SupplierProfile` objects and comparable `PurchaseRecord` or quoted unit costs.
- Relevant `ObligationRecord` objects for payable scheduling.
- Current or projected cash from `cashflow-and-buffer` when cash constraints apply.
- Demand and coverage outputs from `inventory-and-stockout` when inventory sufficiency applies.
- Explicit objective, `asOf`, and planning horizon.

## Optional Inputs

- Discounts, delivery cost, credit period, lead time, MOQ, reliability score, and supplier dependency.
- Penalty rates and explicit partial-payment permissions.
- Open purchase orders and merchant-specified supplier or payment constraints.

## Input Validation Rules

1. Compare suppliers only for compatible products, units, quantities, and delivery destinations.
2. Require each cost component used in total landed cost; missing delivery cost or discount must remain unknown, not zero, unless explicitly stated as zero.
3. Validate obligation category, amount, due date, status, and statutory flag.
4. Exclude paid, cancelled, or disputed obligations unless the request explicitly concerns them.
5. Treat partial payment as forbidden unless explicitly permitted for that obligation.
6. Require dated cash constraints and consistent `merchantId` values.
7. Do not map transaction categories to obligations except through `analytics-data-contract`.

## Freshness / Reuse Rules

- Supplier terms are reusable until changed, expired, or contradicted by a newer quote.
- Cash, demand, inventory, and open-order inputs must be fresh for the optimization horizon.
- Recompute when terms, obligations, penalties, cash projections, inventory needs, objective, or constraints change.

## Financial Logic / Analytical Rules

Use this obligation-specific matrix:

| Obligation category | Base weight | Constraint |
|---|---:|---|
| `GST_PAYMENT` | 1.00 | HARD |
| `TDS_PAYMENT` | 1.00 | HARD |
| `SALARY` | 0.90 | HIGH |
| `UTILITY_BILL` | 0.85 | HIGH |
| `VENDOR_BILL` | 0.70 | MEDIUM |
| `CUSTOMER_INVOICE` | 0.60 | INFO; inflow, not settlement priority |
| `OTHER` | 0.40 | LOW |

- Statutory HARD obligations must not be delayed unless an explicit defined policy permits it.
- Adjust ranking only with explicit due-date proximity, penalty rate, cash-buffer impact, inventory coverage risk, supplier dependency, or merchant constraints. Report each adjustment; do not create hidden weights.
- Respect due dates, penalties, minimum cash buffer, inventory coverage, MOQ, and partial-payment rules as applicable.
- Compare total known purchase cost as unit price times quantity plus delivery cost minus explicit discounts. If a component is unknown, label the comparison partial.
- Credit period changes cash timing but not purchase cost. Lead time changes stockout feasibility but must not be monetized without an explicit rule.
- If all hard constraints cannot be satisfied, return infeasible and identify conflicting constraints rather than silently relaxing them.

## Allowed Methods

- Transparent rule-based ranking using the defined base weights and disclosed adjustments.
- Linear or mixed-integer optimization with PuLP or OR-Tools for allocation and scheduling.
- Scenario comparison across explicit supplier terms or payment dates.
- Lexicographic handling of hard constraints before optimization of lower-priority choices.

## Disallowed Behavior

- Inventing priority weights, discounts, flexibility, partial-payment permissions, lead times, credit periods, MOQ, or reliability.
- Delaying HARD obligations without explicit policy.
- Treating a customer receivable as an outgoing payment.
- Optimizing against stale cash or inventory data without warning.
- Performing authoritative arithmetic outside Code Interpreter.

## Code Interpreter Execution Rules

Use Code Interpreter to construct comparable supplier totals or the constrained optimization model, preserve all hard constraints, record objective terms, and report solver status. Use only approved packages. On infeasibility, return the conflict evidence and no fabricated plan.

## Output Contract

```json
{
  "analysisType": "supplier-payables-optimization",
  "calculationVersion": "1.0.0",
  "asOf": "YYYY-MM-DD",
  "results": {
    "status": "optimal|feasible|partial|infeasible",
    "objective": "string",
    "supplierComparisons": [],
    "recommendedPurchases": [],
    "paymentSchedule": [],
    "lowestProjectedCashBalance": null,
    "minimumCashBuffer": null,
    "bindingConstraints": [],
    "unmetObligations": []
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high|medium|low",
  "confidence": "high|medium|low",
  "sourceRecordIds": []
}
```

## Warnings / Error Conditions

- `ask_for_missing_input`: objective, partial-payment permission, or a term essential to a materially different choice is missing.
- `return_warning_and_continue_with_fallback`: rank only on known comparable factors and label omitted factors, or produce a partial plan with reduced confidence.
- `stop_and_return_insufficient_data`: no comparable cost basis, missing hard-constraint inputs, or infeasible mandatory constraints.

## Example Requests

- "Which rice supplier is better after delivery cost and credit terms?"
- "Which bills should I pay this week while staying above my cash buffer?"
- "Allocate this order across suppliers without risking a stockout."

## Example Structured Outputs

```json
{
  "analysisType": "supplier-payables-optimization",
  "calculationVersion": "1.0.0",
  "asOf": "2026-09-19",
  "results": {
    "status": "optimal",
    "objective": "meet hard obligations and inventory need while preserving minimum cash buffer",
    "supplierComparisons": [{"supplierId": "s-2", "knownLandedCost": 118000, "creditPeriodDays": 30}],
    "recommendedPurchases": [{"supplierId": "s-2", "productId": "p-7", "quantity": 100}],
    "paymentSchedule": [{"obligationId": "o-gst", "date": "2026-09-20", "amount": 42000, "priorityWeight": 1.0}],
    "lowestProjectedCashBalance": 265000,
    "minimumCashBuffer": 250000,
    "bindingConstraints": ["minimumCashBuffer"],
    "unmetObligations": []
  },
  "assumptions": [],
  "warnings": [],
  "dataQuality": "high",
  "confidence": "high",
  "sourceRecordIds": ["supplier-2", "obl-gst", "cash-projection-1"]
}
```
