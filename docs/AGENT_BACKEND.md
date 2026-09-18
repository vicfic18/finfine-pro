# FinFine Pro Agent Backend

## Current Scope

The current implementation provides a local Strands agent with read-only
financial tools. The agent runs on a developer's computer, reads the existing
DynamoDB tables, and sends calculations to AgentCore Code Interpreter in AWS.
It does not change financial records.

The backend also provides an HTTP API that uses the same routes locally and in
AgentCore Runtime. Extra demonstration data and the AWS deployment resources
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
cp env.example .env
```

Open `agent_backend/.env` and replace `replace-with-your-own-groq-key` with your
personal Groq API key. Each teammate must create their own key and local `.env`
file. The `.env` file is ignored by Git and must never be committed.

The configured Groq model identifier is `qwen/qwen3.8-27b`. To start a
conversation:

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

## Run the API for Frontend Development

Each frontend developer can run the backend from their own clone after creating
their personal `.env` file as described above:

```bash
cd agent_backend
uv sync
uv run uvicorn finfine_agent.api:app --reload --host 127.0.0.1 --port 8080
```

The API is then available at `http://127.0.0.1:8080`.

Check that it is running:

```bash
curl http://127.0.0.1:8080/ping
```

Ask the agent a question:

```bash
curl -X POST http://127.0.0.1:8080/invocations \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"What is my latest available balance? Show the source date."}'
```

The frontend can send the same JSON request. Each request is isolated and does
not share conversation history or Code Interpreter state with another caller.
The backend terminal continues to show model and tool activity for debugging.

Local frontend origins on ports `3000` and `5173` are allowed by default. Set
`FINFINE_ALLOWED_ORIGINS` in `.env` to a comma-separated list if the frontend
uses another origin.

To test from another computer on a trusted local network, replace
`--host 127.0.0.1` with `--host 0.0.0.0` and use the backend computer's local IP
address. This development API has no user login yet, so do not expose it to the
public internet.

These are the same routes used by AgentCore Runtime's HTTP interface:

- `GET /ping` returns `{"status":"Healthy"}`.
- `POST /invocations` accepts `{"prompt":"..."}`.

There are no separate local-only API routes. Container, runtime role,
authentication, secret storage, and AWS deployment configuration will be added
in the deployment increment.

## Deploy to AgentCore Runtime

AgentCore Runtime uses the same `GET /ping` and `POST /invocations` routes on
port `8080`. Lambda, API Gateway, and SAM are not required for this deployment
path.

Before deploying:

1. Wait for the AgentCore Code Interpreter session quota in `ap-south-1` to be
   approved.
2. Install Docker with ARM64 `buildx` support and AWS CLI v2.
3. Install the AgentCore starter CLI:

   ```bash
   uv tool install bedrock-agentcore-starter-toolkit
   ```

4. Create a dedicated runtime role. Give it read-only access to the three
   FinFine DynamoDB tables and permission to use AgentCore Code Interpreter.
   Do not deploy using a developer's IAM user credentials.
5. Store the shared deployment Groq key in AgentCore Identity or AWS Secrets
   Manager. Do not put it in Git, a container image, or plain runtime settings.
   Local `.env` files remain only for developer machines.

From `agent_backend`, configure the application as an HTTP runtime:

```bash
agentcore configure --entrypoint finfine_agent/api.py --protocol HTTP
```

During configuration, use region `ap-south-1` and the dedicated runtime role.
Add only non-secret settings such as the table names, tenant ID, model ID, and
allowed frontend origin. The deployed runtime must receive the Groq key through
the secure credential setup from step 5.

Test the AgentCore-compatible server locally before deployment:

```bash
agentcore deploy -l
agentcore invoke '{"prompt":"What is my latest available balance?"}' -l
```

Deploy it after the local invocation succeeds:

```bash
agentcore deploy
agentcore invoke '{"prompt":"What is my latest available balance?"}'
```

The deployment builds an ARM64 container, publishes it to Amazon ECR, and
creates the AgentCore Runtime. Keep the runtime ARN printed by the deployment.
The frontend should not contain AWS credentials or call the runtime with a
developer key. Its server-side route should invoke the runtime using AWS
authentication and forward the returned `answer` to the browser.

The deployment must use authentication before real financial data is exposed.
Use a runtime role with only the required DynamoDB tables and AgentCore actions,
and configure log retention because agent activity is written to CloudWatch.

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

The AWS account currently has an applied Code Interpreter concurrency quota of
zero in `ap-south-1`. A quota increase has been requested before live code
execution can be tested.

## Current AWS Test Data

The development tables are in `ap-south-1` for tenant `msme-001`. At the time
of this increment they contain four bank-statement documents, twenty-eight
transaction rows, and no obligations. The transaction rows contain repeated
imports of the same sample statement, which `get_transactions` ignores when it
can identify the same payment reference.

## Planned Flow

1. The Strands agent receives a financial question through the terminal or
   `POST /invocations`.
2. It calls these tools to read the required records from DynamoDB.
3. AgentCore Code Interpreter performs calculations in AWS.
4. The agent explains the result in plain language.
5. The API returns the answer to the application UI.

During development, the API runs on a developer's computer. In AWS, the same
HTTP contract runs in AgentCore Runtime and a server-side Next.js route invokes
it. Lambda, API Gateway, and SAM are not required for that path.

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

The live Code Interpreter test cannot start until AWS approves the requested
Code Interpreter concurrency quota increase in `ap-south-1`.
