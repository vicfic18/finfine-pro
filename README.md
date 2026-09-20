# FinFine Pro

## 1. Installation and Setup for Local Development

### Prerequisites
- **Node.js**: >= 18.19.0 and **npm**
- **Python**: >= 3.10 and **uv**
- **AWS CLI**: Installed and configured (`aws configure` / `aws sts get-caller-identity`)

### Install Dependencies
```bash
# Install root frontend and backend dependencies
npm install

# Install Python agent backend dependencies
cd agent_backend
uv sync
cd ..
```

### Environment Configuration
1. Configure root `.env`:
   ```bash
   AWS_REGION=ap-south-1
   FINFINE_TENANT_ID=msme-001
   FINFINE_AGENT_RUNTIME_URL=http://127.0.0.1:8080
   ```

2. Configure agent backend `.env`:
   ```bash
   cp agent_backend/env.example agent_backend/.env
   ```
   Add your LLM API key (`OPENROUTER_API_KEY` or `GROQ_API_KEY`) and AWS resource details.

### Run Locally
Start services in separate terminals:

1. **Next.js Frontend**:
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:3000`.

2. **Agent Backend**:
   ```bash
   cd agent_backend
   uv run uvicorn finfine_agent.api:app --reload --host 127.0.0.1 --port 8080
   ```

---

## 2. Commands to Run and Deploy to Amplify Sandbox

### Start Cloud Sandbox
Deploys cloud resources and watches for backend changes:
```bash
npx ampx sandbox
```

### Single-Pass Deployment
Deploys backend resources once without file watching:
```bash
npx ampx sandbox --once
```

### Manage Sandbox Secrets
```bash
# Set a secret
npx ampx sandbox secret set <SECRET_NAME>

# List secrets
npx ampx sandbox secret list

# Remove a secret
npx ampx sandbox secret remove <SECRET_NAME>
```

### Delete Sandbox
Tears down all sandbox AWS resources:
```bash
npx ampx sandbox delete
```

---

## 3. Commands for Generation of Test Data Scripts

### Generate Sample PDFs
Generated files are saved to `sample_data/`.

- **Generate complete MSME document suite (15 sample PDFs)**:
  ```bash
  npx tsx scripts/generate-sample-data.ts
  ```
- **Generate 6-month bank statement (380+ transactions)**:
  ```bash
  npx tsx scripts/generate-6month-statement.ts
  ```
- **Generate single-page UPI statement**:
  ```bash
  npx tsx scripts/generate-sample-statement.ts
  ```

### Seed Statutory Tax Rules & Market Calendar
Populates tax compliance rules and festival demand cycles into DynamoDB:
```bash
npm run procure:taxes
```
*(or `npx tsx scripts/procure-tax-rules.ts`)*

### Run Pipeline Verification Tests
- **Full PDF pipeline test (PDF -> S3 -> Extractor -> Normalizer -> DynamoDB)**:
  ```bash
  npx tsx scripts/test-canonical-pipeline.ts
  ```
- **Asynchronous Step Functions ingestion pipeline test**:
  ```bash
  npx tsx scripts/test-ingestion-pipeline.ts
  ```

### Ingest Test Data via Web UI or API
Direct database seeding is restricted. Ingestion must run through the document pipeline:

- **Via Web UI**: Open `http://localhost:3000/dashboard/ingestion` and click **"Ingest Complete MSME Suite (14 PDFs)"** or drag and drop sample PDFs.
- **Via API**:
  ```bash
  curl -X POST http://localhost:3000/api/ingestion/upload \
    -H "Content-Type: application/json" \
    -d '{"useSample": true, "sampleType": "COMPLETE"}'
  ```
