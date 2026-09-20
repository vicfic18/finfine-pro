# FinFine Pro agent backend

The agent backend is a FastAPI service built around Strands. It supports local
development and is also packaged as the Docker image Lambda defined in
`amplify/backend.ts`. The service is authenticated, tenant-scoped, and
read-only with respect to financial records. Ad hoc user-requested Python
calculations are delegated to the separately provisioned
`finfine-code-executor` Lambda.

## Runtime contract

The API is implemented in `agent_backend/finfine_agent/api.py`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ping` | Health response `{ "status": "Healthy" }`. |
| POST | `/invocations` | Buffered request/response chat. |
| POST | `/invocations/stream` | NDJSON streaming chat projection. |
| GET | `/invocations/conversations` | List the authenticated user's conversations. |
| GET | `/invocations/conversations/{sessionId}` | Read the visible transcript for one conversation. |
| DELETE | `/invocations/conversations/{sessionId}` | Delete the authenticated user's conversation and session objects. |

OpenAPI endpoints are disabled in the current app. The Next.js `/api/chat`
routes are the browser-facing contract and forward the Cognito Bearer token to
this service.

### Request and response

The first request omits `sessionId`; subsequent requests reuse the UUID returned
by the service. `requestId` is required for idempotent retries.

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

Public errors use `{status, requestId, code, message}`. The API deliberately
does not return tool arguments, raw tool results, model traces, or hidden
reasoning in an error response. Important error codes include
`AUTHENTICATION_REQUIRED`, `INVALID_REQUEST`, `SESSION_UNAVAILABLE`,
`CONVERSATION_NOT_FOUND`, `REQUEST_ID_CONFLICT`, `REQUEST_TIMEOUT`, and
`AGENT_DEPENDENCY_UNAVAILABLE`.

The FastAPI dependency validates a Cognito access token with its issuer, JWKS
signature, expiry, `token_use=access`, configured client ID, and non-empty
subject. The subject becomes the tenant ID passed to every financial tool. A
caller cannot select a different tenant or DynamoDB table through the request
body.

## Registered agent tools

`create_agent()` in `agent_backend/finfine_agent/agent.py` registers the
following tools:

### `load_analysis_skill`

Loads one repository guide from `skills/`. The loader only permits a known skill
name and returns its Markdown instructions. Relevant guides include cash-flow,
financial explanation, validation, scenario analysis, inventory, margin,
sales, supplier, merchant intake, and orchestration topics.

### `get_latest_balance`

Returns the latest available liquid balance and source date. The reader prefers
`CashPositionSnapshot`, then document closing-balance metadata, then a
transaction balance.

### `get_transactions`

Returns at most 200 deduplicated transactions for an optional inclusive date
range, with inflow/outflow totals. Duplicates with the same reference and type
are counted once when possible.

### `get_upcoming_obligations`

Returns active scheduled or overdue payables and receivables for a 1–365 day
window. The result includes totals, due dates, type, category, statutory flag,
and warning text when no records are available.

### `get_business_data`

Reads one closed-set, tenant-scoped dataset. The dataset name—not a physical
table name—is supplied by the model. The supported values are:

`documents`, `transactions`, `obligations`, `merchant_settings`,
`cash_positions`, `products`, `sales`, `sale_line_items`,
`inventory_snapshots`, `inventory_items`, `purchases`, `purchase_line_items`,
`suppliers`, `supplier_product_terms`, `purchase_orders`,
`purchase_order_line_items`, and `recurring_expenses`.

The result envelope is:

```json
{
  "dataset": "transactions",
  "count": 2,
  "availableCount": 2,
  "truncated": false,
  "records": [],
  "warning": null
}
```

Supported filters are dataset-specific date ranges, statuses, parent IDs,
product IDs, supplier IDs, and `active_only`. Missing optional tables are
reported as a warning instead of being silently presented as a populated empty
dataset. Reads use DynamoDB scans with a `tenantId` filter; no custom GSI is
required by the current implementation.

### `export_transactions_csv` and `export_business_data_csv`

These tools prepare bounded CSV artifacts for calculations without copying all
business records into the model prompt. Transaction exports are limited to
2,000 rows; canonical dataset exports are limited to 200 rows. Artifacts are
kept in a process-local temporary directory and are referenced by an opaque
`artifactId`.

### `run_financial_python`

Runs a short Python program in `finfine-code-executor`. It accepts code up to
20 KB and at most one CSV artifact up to 4 MB. The validator rejects direct
system, network, credential, and file-access primitives such as `boto3`,
`requests`, `subprocess`, `open`, `eval`, and `exec`.

The executor exposes the scientific packages built into its deployment layer,
including NumPy, pandas, SciPy, and scikit-learn. The child process has a
20-second wall-clock limit, bounded CPU/file/process resources, no AWS
credential environment, and no internet route in the intended deployment.

### `predict_cash_flow_sagemaker`

Despite its historical name, the agent-side implementation currently performs
the forecast in Python. It reads tenant-scoped records, applies optional stress
inputs (`simulate_extra_expense_inr`, `simulate_debtor_delay_days`, and
`simulate_festive_drop_percent`), and returns P10/P50/P90 milestones. It does
not call a SageMaker endpoint. The frontend/server forecast dispatcher has a
separate optional SageMaker integration documented in
`docs/ARCHITECTURE.md`.

## Environment and local setup

The project requires Python 3.11–3.13 and uses `uv`.

```bash
cd agent_backend
uv sync
cp env.example .env
```

Set a personal model key in `.env`; never commit that file. The minimum
financial-reader configuration is:

```text
AWS_REGION=ap-south-1
DOCUMENT_RECORD_TABLE_NAME=<DocumentRecord table>
TRANSACTION_TABLE_NAME=<Transaction table>
OBLIGATION_TABLE_NAME=<Obligation table>
```

The runtime additionally requires:

```text
COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<pool-id>
COGNITO_CLIENT_ID=<user-pool-client-id>
AGENT_SESSION_BUCKET_NAME=<Amplify storage bucket>
AGENT_SESSION_REGION=ap-south-1
AGENT_SESSION_PREFIX=agent-sessions/
AGENT_VERSION=v1
AGENT_SESSION_RETENTION_DAYS=30
AGENT_REQUEST_TIMEOUT_SECONDS=90
```

`COGNITO_USER_POOL_ID` can be used instead of `COGNITO_ISSUER`; the runtime
derives the issuer from the pool ID. Model and executor settings are:

```text
OPENROUTER_API_KEY=<personal key>
MODEL_BASE_URL=https://openrouter.ai/api/v1
MODEL_ID=<tool-calling model>
MODEL_MAX_TOKENS=2048
MODEL_TEMPERATURE=0
CODE_EXECUTOR_REGION=ap-south-1
CODE_EXECUTOR_FUNCTION_NAME=finfine-code-executor
```

`AgentSettings` also supports a Gemini-compatible base URL. The model must
support tool calls and ordinary final-answer text; the repository does not
require one particular provider or model ID.

After `npx ampx sandbox`, use the generated `amplify_outputs.json` to fill in
the Cognito, bucket, region, and table values. The AWS identity running the
service needs:

- read access to the configured canonical DynamoDB tables;
- read/write/list/delete access limited to the `agent-sessions/` prefix;
- permission to invoke `finfine-code-executor`; and
- network access to the model provider when a hosted model is configured.

## Running the local agent and API

The CLI requires an explicit tenant ID because it has no HTTP principal:

```bash
uv run python -m finfine_agent.agent --tenant-id <cognito-sub> --quiet \
  "What is my latest available balance?"
```

Start the HTTP service:

```bash
uv run uvicorn finfine_agent.api:app --reload --host 127.0.0.1 --port 8080
curl http://127.0.0.1:8080/ping
```

Invoke it with a real Cognito access token:

```bash
curl -X POST http://127.0.0.1:8080/invocations \
  -H 'Authorization: Bearer <cognito-access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"What is my latest available balance?","requestId":"315b4a4e-d5f8-4b21-911c-37bb629e869d"}'
```

The Next.js proxy uses `FINFINE_AGENT_RUNTIME_URL` when set. Otherwise it uses
the custom `agentApiUrl` generated by `amplify/backend.ts`.

## Durable sessions and idempotency

Each invocation creates a fresh Strands agent and restores its
`SnapshotSessionManager` from S3. Public session IDs are UUIDs; storage IDs are
opaque SHA-256-derived values bound to the authenticated subject and
`AGENT_VERSION`.

The same prefix contains:

- Strands snapshot objects;
- an owner-digested conversation catalog;
- visible transcript JSON containing only completed user prompts and final
  assistant answers; and
- request-id records for safe retries.

The registry rejects foreign, expired, or incompatible sessions. A reused
request ID with a different prompt/session context returns a conflict. In-
process locks serialize turns and catalog writes. Moving to multiple writable
runtime replicas requires a concurrency-safe catalog/index.

## Tests and operational limits

Run the backend test suite with:

```bash
uv run pytest -q
```

The Lambda executor limits are defined in
`agent_backend/lambda_code_executor/lambda_function.py`:

| Limit | Value |
| --- | ---: |
| Python code | 20 KB |
| Input files | 0 or 1 CSV |
| CSV size | 4 MB |
| Captured stdout/stderr | 200 KB per stream |
| Child execution timeout | 20 seconds |
| Child CPU limit | 18 seconds |

The FastAPI request timeout defaults to 90 seconds and is bounded by the
Next.js proxy to at most 120 seconds. Keep model calls, dataset exports, and
Python programs within those limits.

## Deployment status

The repository contains both local and Lambda packaging paths. The Amplify
backend creates the Docker image Lambda for the FastAPI service, but the
`finfine-code-executor` Lambda and its scientific dependency layer are
external. A future deployment can move the runtime behind another HTTP
front-door without changing the `/invocations` contract; update the Next.js
runtime URL and preserve the Cognito/session behavior.
