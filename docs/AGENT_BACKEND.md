# FinFine Pro Agent Backend

## Current Scope

The current implementation provides a local Strands agent with read-only
financial tools. The agent runs on a developer's computer, reads the existing
DynamoDB tables, and sends calculations to AgentCore Code Interpreter in AWS.
It does not change financial records.

The API and extra demonstration data are intentionally left for later
increments.

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
cp env.example .env
```

Open `agent_backend/.env` and replace `replace-with-your-own-groq-key` with your
personal Groq API key. Each teammate must create their own key and local `.env`
file. The `.env` file is ignored by Git and must never be committed.

The verified Groq model identifier is `qwen/qwen3-32b`. Groq's current model
documentation does not list `qwen/qwen3.8-27b`. To start a conversation:

```bash
uv run python -m finfine_agent.agent
```

To ask one question and exit:

```bash
uv run python -m finfine_agent.agent "What is my latest balance?"
```

Tracing is enabled by default. The terminal shows normal model output, tool
names, tool inputs, tool results, duration, errors, and the final answer.
Secrets are redacted. Hidden chain-of-thought is not shown; the agent provides
short action summaries instead. Use `--quiet` when only the final answer is
needed.

The model settings use Groq's OpenAI-compatible endpoint at
`https://api.groq.com/openai/v1`. The application also accepts an exported
`GROQ_API_KEY`; an exported value takes precedence over the local `.env` file.

The tools can also be imported directly:

```python
from finfine_agent import (
    get_latest_balance,
    get_transactions,
    get_upcoming_obligations,
)
```

The tenant is set by `FINFINE_TENANT_ID`; it is not accepted as an
agent-controlled argument.

## Code Execution

AgentCore Code Interpreter runs code in an isolated AWS session. The agent uses
Python for exact calculations, cash projections, statistics, charts, and small
machine-learning experiments. Common libraries such as pandas, NumPy,
scikit-learn, statsmodels, XGBoost, PyTorch, PuLP, and OR-Tools are available in
the managed environment.

The current instructions prevent the agent from using code to access DynamoDB,
credentials, environment variables, or the internet. Financial records are
read only through the three controlled tools and only the required values are
passed into the interpreter. The agent receives a Python-only tool; terminal
commands and AgentCore's wider file-management actions are not exposed.

Predictions must be described as estimates. The current sample has too little
unique history for a dependable ML forecast, so any model trained on it is only
a technical demonstration.

The first live capability check reached AgentCore but could not start a session
because the AWS account's current Code Interpreter session limit was already in
use. An existing session must finish or be stopped before live code execution
can be tested.

## Current AWS Test Data

The development tables are in `ap-south-1` for tenant `msme-001`. At the time
of this increment they contain four bank-statement documents, twenty-eight
transaction rows, and no obligations. The transaction rows contain repeated
imports of the same sample statement, which `get_transactions` ignores when it
can identify the same payment reference.

## Planned Flow

1. The local Strands agent receives a financial question through the terminal.
2. It calls these tools to read the required records from DynamoDB.
3. AgentCore Code Interpreter performs calculations in AWS.
4. The agent explains the result in plain language.
5. A later API will make the agent available to the application UI.

The future API can be hosted in AgentCore Runtime and called by a server-side
Next.js route. Lambda, API Gateway, and SAM are not required for that path. The
deployment choice will be confirmed when the API increment begins.

## End-to-End Test

1. Confirm AWS access:

   ```bash
   aws sts get-caller-identity
   ```

2. Prepare the local environment:

   ```bash
   cd agent_backend
   uv sync
   cp env.example .env
   ```

3. Put a personal Groq key in `.env`, then run the local checks:

   ```bash
   uv run pytest -q
   ```

4. Start the agent with terminal tracing:

   ```bash
   uv run python -m finfine_agent.agent
   ```

5. Test the data tools:

   ```text
   What is my latest available balance? Show the source date.
   List the transactions from 2026-10-01 to 2026-10-07.
   What payments and receivables are due in the next 30 days?
   ```

6. Test Code Interpreter:

   ```text
   Using the available transactions, calculate total inflow, total outflow,
   and net cash flow in Python. Explain the inputs you used.
   ```

7. Test the ML safeguard:

   ```text
   Try a small cash-flow prediction model using the available history. Tell me
   whether the data is sufficient and do not present the result as reliable if
   it is too small.
   ```

Expected terminal trace:

```text
[agent] Working...
[model] I will read the relevant transactions first.
[tool] get_transactions
[tool input]
...
[tool result] get_transactions in 0.42s
...
[tool] run_financial_python
...
[agent] Completed.
```

The live Code Interpreter test currently cannot start while the AWS account's
Code Interpreter session quota is full. Wait for an active session to expire or
stop an identified session before testing steps 6 and 7.
