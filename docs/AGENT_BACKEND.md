# FinFine Pro Agent Backend

## Current Scope

The Strands agent and HTTP API run on a developer computer. They read the
existing DynamoDB tables without changing them. Financial Python calculations
run in the private `finfine-code-executor` AWS Lambda function.

Every request is tenant-scoped from the verified Cognito access-token subject.
The runtime selects the business data server-side; a caller cannot choose or override it. Cognito's
`sub` claim owns chat sessions within that tenant.

The backend exposes:

- `GET /ping`
- `POST /invocations` with the stable chat contract documented below
- `GET /invocations/conversations` for the signed-in user's recent chats
- `GET /invocations/conversations/{sessionId}` for a safe visible transcript
- `DELETE /invocations/conversations/{sessionId}` to remove a chat and its session data

The browser calls the same-origin Next.js `/api/chat` route. That route
validates the request, forwards the Cognito access token, applies a timeout,
and sanitizes upstream failures. Only the server-side runtime URL changes when
the FastAPI service is later moved behind Lambda/API Gateway.

## Agent Tools

### `load_analysis_skill`

Optionally loads one analysis guide from the repository for detailed work. The
terminal trace shows which guide was loaded. Simple balance, transaction, and
obligation lookups do not need a guide. For forecasting, cash-flow planning,
inventory, margin, supplier, or scenario work, the agent can load only the
guide or guides that help with that question.

### `get_latest_balance`

Returns the newest closing balance, source date, and source document.

### `get_transactions`

Returns up to 200 transactions for an optional date range. Repeated imports
with the same payment reference are counted once.

### `get_upcoming_obligations`

Returns scheduled payables and receivables for a chosen number of days.

### `export_transactions_csv`

Exports up to 2,000 deduplicated transactions to a short-lived local CSV
artifact. The model receives only its artifact ID, filename, row count, and
column names. Transaction rows are not copied into the model conversation.

### `run_financial_python`

Runs validated Python in the private Lambda executor. Pass an `artifact_id`
returned by `export_transactions_csv` to make the file available to Python as
`transactions.csv`.

The executor includes NumPy, pandas, SciPy, and scikit-learn.

Users do not need to mention Python or choose tools. Direct lookups use the data
tools. Questions requiring new arithmetic, grouping, comparisons, trends,
projections, statistics, optimization, or predictions automatically use the CSV
export and Lambda Python tools. If execution fails, the agent reports the
failure instead of substituting figures from an earlier turn.

## Local Setup

The project supports Python 3.11 through 3.13.

```bash
cd agent_backend
uv sync
cp env.example .env
```

Edit `.env` and add your personal OpenRouter API key. Never commit this file or
share the key. Each teammate must create their own OpenRouter key.

Important settings:

```text
AWS_REGION=ap-south-1
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/replace-with-user-pool-id
COGNITO_CLIENT_ID=replace-with-user-pool-client-id
AGENT_SESSION_BUCKET_NAME=replace-with-amplify-storage-bucket
AGENT_SESSION_REGION=replace-with-amplify-storage-region
AGENT_SESSION_PREFIX=agent-sessions/
AGENT_VERSION=v1
AGENT_SESSION_RETENTION_DAYS=30
AGENT_REQUEST_TIMEOUT_SECONDS=90
CODE_EXECUTOR_REGION=ap-south-1
CODE_EXECUTOR_FUNCTION_NAME=finfine-code-executor
OPENROUTER_API_KEY=replace-with-your-own-openrouter-key
MODEL_BASE_URL=https://openrouter.ai/api/v1
MODEL_ID=nex-agi/nex-n2.5-pro:free
```

The signed-in AWS identity running FastAPI must be able to read the configured
DynamoDB tables, invoke `finfine-code-executor`, and read/write the
`agent-sessions/` prefix in the existing Amplify storage bucket. Conversation
deletion also requires `s3:DeleteObject`, and snapshot cleanup requires
`s3:ListBucket` constrained to that prefix. That prefix is
not present in `amplify/storage/resource.ts`, so Amplify does not grant browser
identities access to it. The bucket encrypts objects at rest, and the backend
adds a prefix-scoped lifecycle rule whose default retention is 30 days.

After `npx ampx sandbox`, take the Cognito pool/client, storage bucket, and
region values from `amplify_outputs.json`. Custom outputs also include the
agent session bucket, prefix, and retention values.

The backend uses OpenRouter's OpenAI-compatible API. Nex N2.5 Pro is the current
test model because it supports tool calling, but it is not a hard requirement.
You can replace `MODEL_ID` with another capable OpenRouter model. For this agent,
choose one that supports `tools` and `tool_choice`, follows multi-step tool calls
reliably, and returns ordinary final-answer text. Pin a specific model instead of
using a random router so one workflow does not change models between steps.

The backend disables and excludes provider-specific reasoning metadata because
Strands cannot replay that metadata during a later Chat Completions tool-call
turn. Free model availability, limits, and behavior can change. Providers may
log prompts or use them to improve their models. Use test data unless your team
has reviewed and accepted the provider's data policy.

```bash
aws login
aws sts get-caller-identity
```

## Run the Agent

Start a traced conversation:

```bash
uv run python -m finfine_agent.agent
```

Ask one question and exit:

```bash
uv run python -m finfine_agent.agent \
  "Export the transactions to CSV and calculate net cash flow with pandas."
```

The terminal shows model output, tool inputs, tool results, timing, and errors.
Secrets are redacted. Hidden chain-of-thought is not displayed.

## Run the API for Frontend Development

```bash
uv run uvicorn finfine_agent.api:app --reload --host 127.0.0.1 --port 8080
```

```bash
curl http://127.0.0.1:8080/ping
```

```bash
curl -X POST http://127.0.0.1:8080/invocations \
  -H 'Authorization: Bearer <cognito-access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"What is my latest available balance? Show the source date.","requestId":"315b4a4e-d5f8-4b21-911c-37bb629e869d"}'
```

The token must be a Cognito access token. The API validates its issuer,
signature, expiry, `token_use=access`, client ID, and `sub`.

### Invocation contract

`sessionId` is omitted on the first turn. FastAPI returns the server-generated
ID, and subsequent turns send it back.

```json
{
  "prompt": "Will I have enough money to pay staff on the 10th?",
  "requestId": "315b4a4e-d5f8-4b21-911c-37bb629e869d",
  "sessionId": "optional-server-session-id"
}
```

```json
{
  "status": "success",
  "requestId": "315b4a4e-d5f8-4b21-911c-37bb629e869d",
  "sessionId": "server-session-id",
  "answer": "..."
}
```

Errors always use `{status, requestId, code, message}` and do not expose tool
arguments, tool outputs, model events, financial records, traces, or generated
reasoning summaries. A supplied session that is missing, expired, belongs to a
different user, or was created by an incompatible agent version returns the
same `SESSION_UNAVAILABLE` error. The UI keeps the visible transcript and asks
the user to start a new chat; it never silently replays the failed request.

Completed requests are stored by `requestId` so a safe retry returns the same
answer. Reusing a request ID for different input is rejected.

### Durable sessions

Each invocation creates a fresh Strands `Agent` and awaits `invoke_async()`.
`SnapshotSessionManager` restores and saves the conversation through Strands'
built-in `S3Storage`. Public session IDs remain UUIDs; S3 keys use an opaque
hash of the authenticated owner, session ID, and agent version. In-process
locks serialize turns for one session. S3 remains the durable source of truth
across process restarts; there is no additional cache or DynamoDB session
table.

The same private prefix contains an application-owned conversation catalog and
visible transcript JSON. Catalog keys are scoped by a SHA-256 digest of the
Cognito `sub`. Transcripts contain only completed user prompts and final
assistant answers; tool calls, tool results, and internal snapshot state are
never returned by the history API. The first prompt becomes the title without
another model call. These objects share the 30-day lifecycle used by the
Strands snapshots.

Catalog writes use an in-process owner lock, matching the current single
runtime deployment. Move the catalog to a concurrency-safe index such as
DynamoDB before enabling multiple writable runtime replicas.

## Lambda Executor

The current AWS resources are in `ap-south-1`:

- Function: `finfine-code-executor`
- Layer: `finfine-python-analysis`
- Build bucket: `finfine-lambda-artifacts-uthay-359851121709-ap-south-1-an`
- Role: `FinFineLambdaCodeExecutorRole`

The function has 2 GiB memory and a 35-second Lambda timeout. Generated Python
has a 20-second execution timeout. It runs in two private subnets without an
internet route.

After network setup, its role retains only CloudWatch logging permission. It
has no DynamoDB, S3, OpenRouter, Bedrock, AgentCore, or Secrets Manager access.

The S3 bucket is used only while publishing the scientific dependency layer.
Transaction CSV files are sent directly in the authenticated Lambda invocation
and are not stored in S3.

The function has no public URL. The local backend invokes it with the AWS SDK.
The frontend calls the FinFine backend, never Lambda directly.

## Execution Limits

The executor accepts:

- Python code up to 20 KB.
- At most one CSV input.
- CSV input up to 4 MB.
- Captured output up to 200 KB.

Runaway code and its child processes are killed. The child receives no AWS
credential environment variables, and the VPC has no internet route.

Ordinary Lambda may reuse an execution environment. Every invocation therefore
uses a new temporary directory that is deleted afterward. Lambda tenant
isolation is not available to this account in `ap-south-1`, so this executor is
currently intended for the local, single-tenant development flow.

The code validator blocks direct system, network, credential, and AWS imports.
It is an additional guard; the no-secret Lambda environment is the main safety
boundary.

## Tests

```bash
uv run pytest -q
```

Useful manual questions:

```text
What is my latest available balance? Show the source date.

Export all available transactions to CSV. Use pandas in Python to calculate
total inflow, total outflow, and net cash flow. State the row count and date
range used.

Use the transaction CSV to try a small cash-flow prediction. Explain why the
result may be unreliable if the available history is small.

Load the relevant analysis guides, then export all available transactions to
CSV. Use pandas in Python to calculate total inflow, total outflow, and net cash
flow. State the row count and date range used, and explain any data limits.
```

Expected trace:

```text
[agent] Working...
[tool] export_transactions_csv
[tool result] export_transactions_csv ...
[tool] run_financial_python
[tool result] run_financial_python ...
[agent] Completed.
```

## Planned API Hosting

Only the Python executor is deployed today. The Strands agent and API remain
local. A future Lambda/API Gateway handler must implement the same invocation
contract; then update only `FINFINE_AGENT_RUNTIME_URL` for the Next.js proxy.
