# FinFine Pro Agent Backend

## Current Scope

This first increment provides read-only financial tools for a future Strands
agent. The tools run on a developer's computer and read the existing DynamoDB
tables in AWS. They do not change financial records.

The agent loop, AgentCore Code Interpreter, API, and extra demonstration data
are intentionally left for later increments.

## Available Tools

### `get_latest_balance`

Returns the newest closing balance, its date, and the source document. It first
uses an extracted bank statement and falls back to a transaction balance when
needed.

### `get_transactions`

Returns transactions within an optional date range, together with total money
in and total money out. Repeated imports with the same payment reference are
counted once.

### `get_upcoming_obligations`

Returns scheduled payables and receivables for a chosen number of days. The
caller can request all obligations, only payables, or only receivables.

## Run Locally

The tools require Python 3.11, 3.12, or 3.13 and AWS credentials that can read
the three DynamoDB tables.

```bash
cd agent_backend
uv sync
```

Export the values shown in `agent_backend/env.example`, then import the tools:

```python
from finfine_agent import (
    get_latest_balance,
    get_transactions,
    get_upcoming_obligations,
)
```

Strands will call these functions after the agent loop is added. The tenant is
set by `FINFINE_TENANT_ID`; it is not accepted as an agent-controlled argument.

## Current AWS Test Data

The development tables are in `ap-south-1` for tenant `msme-001`. At the time
of this increment they contain four bank-statement documents, twenty-eight
transaction rows, and no obligations. The transaction rows contain repeated
imports of the same sample statement, which `get_transactions` ignores when it
can identify the same payment reference.

## Planned Flow

1. The local Strands agent receives a financial question.
2. It calls these tools to read the required records from DynamoDB.
3. AgentCore Code Interpreter performs calculations in AWS.
4. The agent explains the result in plain language.
5. A later API will make the agent available to the application UI.

The future API can be hosted in AgentCore Runtime and called by a server-side
Next.js route. Lambda, API Gateway, and SAM are not required for that path. The
deployment choice will be confirmed when the API increment begins.
