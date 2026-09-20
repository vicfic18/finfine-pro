# System Architecture Design Document: Agentic Financial Copilot for Indian MSMEs

> [!NOTE]
> For the comprehensive, audited AWS architecture diagram and implementation breakdown with exact ARNs, table schemas, Step Function state machines, and Mermaid diagrams, refer to [AWS_ARCHITECTURE.md](file:///home/vicfic/prog/hacks/finfine-pro/docs/AWS_ARCHITECTURE.md).

---

## 1. Executive Summary & Problem Context

### 1.1 Business Problem & Context

Micro, Small, and Medium Enterprises (MSMEs) represent the operational backbone of the Indian economy. While digital payment rails (UPI, IMPS, RuPay) have achieved near-universal penetration, financial intelligence tools have not kept pace. Business owners operate with fragmented visibility:

* Inflow and outflow data resides across physical notebooks, fragmented images of invoices, supplier receipts, and multi-bank statements.
* Financial decision-making is reactive, anchored exclusively to current liquid bank balances rather than dynamic, temporal projections of upcoming commitments.
* Cash shortfalls are discovered abruptly, leading to punitive outcomes: statutory defaults (GST penalties), damaged supplier credit, or expensive emergency financing.

### 1.2 System Vision

This architecture defines a semi-autonomous, agentic financial operating system designed to ingest unstructured financial artifacts, normalize multi-source records into a temporal cash-flow model, calculate deterministic liquidity indicators (Days-to-Zero), and orchestrate counterparty actions. The platform pairs deterministic mathematical modeling with generative multilingual reasoning, enabling an MSME owner to query their immediate solvency and receive contextual, prioritized recommendations in regional Indian languages.

---

## 2. Requirements Specification

### 2.1 Functional Requirements

#### F-1: Multimodal Financial Document Ingestion & Normalization

* The system must ingest single/multi-page bank statement exports (PDF), digital invoice screenshots, point-of-sale receipts, and physical or handwritten slips (PNG, JPEG, PDF).
* The ingestion pipeline must extract and normalize core financial entities: realized cash balances, payables (amounts, counterparty names, due dates, penalty clauses), and receivables (expected clearing dates, debtor identities).
* The pipeline must operate asynchronously without blocking the user interface.

#### F-2: Deterministic Runway & Solvency Modeling

* The system must calculate a real-time **Days-to-Zero ($D$)** metric representing the number of operational days remaining before liquid balances cross below zero under expected inflows and outflows.
* The system must model payment priorities using constraint-based linear optimization rather than stochastic LLM generation, factoring in statutory penalties, vendor criticality, and supplier relationship tiers.

#### F-3: Interactive Scenario Simulation

* The system must enable conversational what-if analysis (e.g., discretionary capital expenditures, delayed receivables, inventory discounts).
* The engine must project the marginal impact of simulated events on upcoming obligations and output deterministic counter-arguments or alternative allocations.

#### F-4: Context-Aware Action Preparation & Vernacular Communication

* The system must generate counterparty-specific action items (e.g., deferral negotiation messages, early payment discount requests, promissory payment splits).
* Generated outputs must adapt tone, formality, and language (English, Hindi, Tamil, Hinglish) according to the counterparty’s profile and historical flexibility.

#### F-5: Explainable Chain-of-Thought (CoT) Interface

* The system must translate mathematical solver outputs into plain-language explanations that justify which obligations were delayed or prioritized and why.

### 2.2 Non-Functional Requirements

#### NF-1: Budget & Cost Optimization ($100 Envelope)

* Infrastructure must be optimized to operate within a total evaluation budget of $100.
* Architectures requiring high continuous baseline charges (such as persistent OpenSearch clusters, multi-AZ provisioned databases, or long-running high-memory EC2/ECS instances) are prohibited. Serverless and scale-to-zero compute must be used across all tiers.

#### NF-2: Architectural Precision & Model Separation

* Generative AI models must never perform arithmetic, financial compounding, or linear resource allocation.
* Mathematical calculations must run exclusively within deterministic runtime engines; generative models are restricted to entity extraction, natural language translation, conversational orchestration, and relational tone modulation.

#### NF-3: Latency & Responsiveness

* Synchronous conversational queries must complete their orchestrations within 4 seconds.
* Asynchronous document ingestion pipelines must parse, normalize, and update system state within 30 seconds for single-page artifacts and 90 seconds for multi-page statements.

#### NF-4: Tenant Isolation & Data Governance

* System design must enforce logical tenant isolation across all storage layers, ensuring an MSME's proprietary cash-flow data, invoice metadata, and counterparty relationships remain partitioned.

---

## 3. Architecture Topology & Component Design

```
[MSME User Device]
        │
        ▼ (HTTPS)
┌─────────────────────────────────────────────────────────┐
│ 1. Client & Access Layer                                │
│   [Amplify Hosting (Next.js App)] ◄──► [Amazon Cognito] │
└───────────────────────┬─────────────────────────────────┘
                        │ (JWT-Authenticated REST API)
                        ▼
┌─────────────────────────────────────────────────────────┐
│ 2. API Gateway & Routing Layer                          │
│   [Amazon API Gateway]                                  │
└───────────┬─────────────────────────────────┬───────────┘
            │                                 │
 (Direct Storage / Uploads)                   │ (Agent Sessions & Queries)
            ▼                                 ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│ 3. Asynchronous Ingestion     │ │ 4. Synchronous Agentic Decision Core  │
│   [Amazon S3 (Presigned)]     │ │   [Amazon Bedrock Agents (Orch.)]     │
│              │                │ │                  │                    │
│   [Amazon EventBridge]        │ │                  ▼                    │
│              │                │ │   [AWS Lambda (Action Group Adapters)]│
│              ▼                │ └───────────────┬───────────────────────┘
│   [AWS Step Functions]        │                 │
│        ├─► [Bedrock Vision]   │                 │ (HTTP / RPC)
│        └─► [Parser Lambda]    │                 ▼
└──────────────┬────────────────┘ ┌───────────────────────────────────────┐
               │                  │ 5. Deterministic Computation Engine   │
               │ (Normalized)     │   [AWS App Runner (FastAPI / PuLP)]   │
               ▼                  └───────────────┬───────────────────────┘
┌─────────────────────────────────────────────────┴───────────────────────┐
│ 6. Operational Data Layer                                               │
│   [Amazon DynamoDB (Single-Table Storage & GSIs)]                       │
└─────────────────────────────────────────────────────────────────────────┘

```

### 3.1 Client & Access Layer

* **AWS Amplify Hosting (Next.js/React):** Serves the responsive frontend. It hosts the dashboard (runway charts, upcoming obligations, days-to-zero visual gauge) and conversational chat modules. Amplify manages the CI/CD pipeline from source code directly to edge distribution.
* **Amazon Cognito User Pools:** Manages identity authentication, user registration, and role-based access control. Cognito issues scoped JSON Web Tokens (JWT) containing a unique `tenant_id` claim, ensuring downstream services enforce strict multi-tenant boundary isolation.

### 3.2 Ingestion & Processing Pipeline (Asynchronous)

* **Amazon S3:** Serves as the immutable object store. It provides secure, presigned upload URLs for user documents, isolating raw artifacts from web application servers. S3 buckets implement explicit lifecycle rules to transition intermediate files to infrequent tiers or expire them post-processing to minimize storage overhead.
* **Amazon EventBridge:** Captures S3 `ObjectCreated` events. It decouples document ingress from the downstream processing pipeline, broadcasting events directly to the orchestration state machine.
* **AWS Step Functions:** Orchestrates the ingestion workflow. The state machine manages parallel execution branches for multi-page documents, implements retries with exponential backoff, and tracks job status across extraction, validation, and database ingestion states.
* **Amazon Bedrock (NVIDIA Nemotron Nano 12B / Claude Multimodal):** Acts as the multimodal extraction engine (`nvidia.nemotron-nano-12b-v2` / Claude). By executing structured schema extraction directly against invoice and statement images/PDFs, it bypasses the language limitations of traditional OCR engines, capturing multilingual terminology, non-standard invoice formats, and handwritten receipts at low token costs.
* **AWS Lambda (Ingestion Normalizer):** Validates the raw JSON emitted by the extraction model against normalized canonical schemas (detailed in [DATA_SCHEMA_AND_STORAGE.md](file:///home/vicfic/prog/hacks/finfine-pro/docs/DATA_SCHEMA_AND_STORAGE.md)). It resolves dates into standardized ISO formats, extracts statutory identifiers (GSTIN, PAN), reconciles transaction classifications, computes solver priority weights ($w_i^{\text{type}}$), and executes batch writes to DynamoDB.

### 3.3 Synchronous Agentic Decision Core

* **Amazon API Gateway:** Provides the single RESTful entry point for conversational queries and financial state fetching. It validates Cognito JWT tokens, handles throttling, and routes requests to Bedrock Agent proxy Lambdas.
* **Amazon Bedrock Agents:** Functions as the conversational orchestrator. Configured with a system prompt optimized for financial reasoning and Indian MSME operational realities, the agent breaks user prompts into logical execution steps, selects appropriate Action Groups, passes structured inputs, and aggregates tool outputs into a coherent, natural response.
* **AWS Lambda (Action Group Handlers):** Implements the OpenAPI interface required by Bedrock Agents. Functions map agent action requests to backend data calls (fetching current liquidity state from DynamoDB) or simulation executions (forwarding hypothetical financial parameters to the deterministic computation engine).

### 3.4 Deterministic Computation Engine

* **AWS App Runner:** Hosts a containerized Python service (FastAPI) running scientific computing and optimization libraries (NumPy, SciPy, PuLP). App Runner provides a managed, serverless container execution environment that can scale down to zero when idle to conserve credit.
* **Mathematical Responsibilities:**
* **Solvency Countdown Engine:** Computes the Days-to-Zero metric by projecting daily cumulative cash balance:

$$B(t) = B_0 + \sum_{\tau=0}^{t} \mathbb{E}[R_\tau] - \sum_{\tau=0}^{t} P_\tau$$



The engine flags the earliest time step $t$ where $B(t) < 0$.
* **Obligation Prioritizer (Mixed-Integer Linear Program):** When liquidity is insufficient to cover all scheduled payables within window $T$, the engine resolves an objective function maximizing settled obligations while penalizing late fees, statutory defaults, and strategic relationship costs:

$$\max \sum_{i \in \mathcal{P}} \left( w_i^{\text{type}} \cdot w_i^{\text{rel}} \cdot x_i - \lambda_i (1 - x_i) \right)$$


$$\text{subject to} \quad \sum_{i \in \mathcal{P}} c_i x_i \le B_0 + R_{\text{confirmed}}, \quad x_i \in \{0, 1\}$$



Where $w_i^{\text{type}}$ represents statutory or operational criticality, $w_i^{\text{rel}}$ denotes vendor flexibility, $c_i$ is the payment amount, and $\lambda_i$ captures default penalty curves.
* **Simulation Sandbox:** Accepts user hypotheses (e.g., capital purchase, customer payment delay) and evaluates counterfactual states without altering the persistent database.



### 3.5 Operational Data Layer

* **Amazon DynamoDB:** Serves as the primary operational database using a single-table architecture design pattern. All records are partitioned by `TenantID` to enforce multi-tenancy.
* **Global Secondary Indexes (GSIs):** Dedicated GSIs support efficient temporal range queries (e.g., fetching all payables due between dates $t_1$ and $t_2$) and counterparty-specific lookups without running full table scans.
* **Data Lifecycle:** Transient simulation states remain in application memory; only confirmed transactions, normalized ledger items, and baseline scenario parameters persist to DynamoDB.

---

## 4. End-to-End Operational Workflows

### 4.1 Asynchronous Document Ingestion Workflow

1. The MSME user initiates an upload through the Next.js interface. The frontend requests a presigned URL from API Gateway.
2. The client uploads the artifact directly to an S3 raw ingestion bucket under a tenant-specific prefix.
3. S3 publishes an event to EventBridge, which triggers the Step Functions Ingestion State Machine.
4. Step Functions executes a Lambda task that evaluates the document's MIME type:
* Single-page images and digital invoice screenshots pass directly to Amazon Bedrock (Claude 3.5 Haiku) with a strict prompt defining the required financial extraction schema.
* Multi-page PDFs are decomposed into page-level representations before invoking Haiku concurrently.


5. The model outputs structured JSON containing the financial entities.
6. A Normalization Lambda function validates extracted amounts, assigns system priority weights based on document type (e.g., GST challans receive statutory classification), and updates the tenant's ledger and obligation records in DynamoDB.
7. EventBridge emits an internal notification that triggers a lightweight state recalculation, updating the tenant's baseline Days-to-Zero indicator.

```
[Client] ──(1. Get Presigned URL)──► [API Gateway] ──► [Lambda]
   │                                                      │
   ▼                                                      ▼
[Upload Image/PDF] ──(2. S3 Bucket) ──► [EventBridge] ──► [Step Functions]
                                                               │
                                  ┌────────────────────────────┴───────────────────────────┐
                                  ▼                                                        ▼
                     [Bedrock Claude 3.5 Haiku]                                [Normalization Lambda]
                     (Extract JSON Entities)                                   (Validate & Standardize)
                                  │                                                        │
                                  └────────────────────────────┬───────────────────────────┘
                                                               ▼
                                                     [DynamoDB (State Store)]

```

### 4.2 Deterministic Solvency Evaluation & Scenario Simulation

1. An incoming conversational query (e.g., *"Can I purchase ₹60,000 worth of equipment today?"*) is routed by API Gateway to the Amazon Bedrock Agent.
2. The Agent analyzes the intent, identifying the need for current balance parameters, short-term commitments, and scenario modeling.
3. The Agent invokes its registered Action Group Lambda, which reads the current normalized financial profile from DynamoDB.
4. The Lambda forwards the retrieved state along with the simulated parameter (immediate cash reduction of ₹60,000) to the App Runner service via a private HTTP endpoint.
5. App Runner runs the MILP solver and runway equation:
* It calculates the revised Days-to-Zero trajectory.
* It determines that the proposed purchase forces a breach in liquidity on day 6, directly conflicting with a non-negotiable statutory tax payment.
* It calculates an alternative valid scenario: deferring a low-penalty utility bill and executing the equipment purchase as two split disbursements.


6. App Runner returns deterministic simulation results (solver status, Days-to-Zero impact, constraint violations, and optimal disbursement schedules) to the Action Group Lambda.
7. The Lambda passes the structured calculation back to the Bedrock Agent.

### 4.3 Multilingual Action Generation & Reasoning

1. The Bedrock Agent synthesizes the deterministic solver output using a secondary reasoning step powered by Claude 3.5 Sonnet.
2. The Agent builds a structured Chain-of-Thought explanation:
* It states the immediate impact on runway (e.g., *"Purchasing this today reduces your cash runway from 18 days to 5 days"*).
* It highlights the specific conflict (e.g., *"A ₹45,000 GST liability is due in 6 days and cannot be covered if this expense occurs now"*).
* It presents the alternative mitigation plan calculated by the solver.


3. If an obligation requires negotiation or deferral to make the scenario viable, the Agent drafts a contextual communication artifact.
4. The draft matches the counterparty profile stored in the database:
* High-formality, standardized language for institutions or formal suppliers.
* Polite, culturally appropriate vernacular (Hindi, Tamil, or Hinglish) for local vendors with whom the MSME maintains flexible relationships.


5. The structured response, containing the explanation, visualization data points, and ready-to-use message drafts, is delivered to the frontend interface.

```
[User Query] ──► [API Gateway] ──► [Bedrock Agent (Claude 3.5 Sonnet)]
                                            │
                                            ▼ (Action Group Call)
                                   [Tool Handler Lambda]
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
         [DynamoDB Data Layer]                            [App Runner Engine]
         (Fetch Balances & Rules)                         (Execute MILP & Runway)
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            ▼
                               [Bedrock Agent Synthesis]
                       (Generate Vernacular CoT & Action Drafts)
                                            │
                                            ▼
                                     [Client Output]

```

---

## 5. Security, Tenancy & Cost Governance

### 5.1 Multi-Tenant Data Isolation

* **Storage Partitioning:** All DynamoDB entities mandate the `TenantID` as the partition key ($PK$). Access patterns are constrained to prevent cross-tenant queries.
* **IAM Scoping:** S3 object keys are strictly prefixed by tenant identifier (e.g., `s3://bucket/tenants/{tenant_id}/raw/`). Action Group Lambdas dynamically extract the `tenant_id` claim from validated Cognito tokens, disallowing client-supplied tenant identification in query payloads.

### 5.2 Financial Compliance & Guardrails

* **Arithmetic Isolation:** LLMs are barred from performing arithmetic derivations in their system prompts. All numbers displayed in the interface originate directly from App Runner calculations.
* **Statutory Compliance Rules:** The optimization solver enforces hard, non-relaxable constraints on statutory payments (GST, TDS, EPF). The system prevents scenarios that compromise tax obligations in favor of discretionary operational expenditures.

### 5.3 Cost Optimization Architecture ($100 Envelope)

| Resource Layer | Architectural Decision | Cost Impact & Justification |
| --- | --- | --- |
| **Search & Indexing** | Eliminate Amazon OpenSearch; use DynamoDB GSIs. | Saves ~$35–$50/month in baseline node/OCU charges; DynamoDB operates within the Free Tier/On-Demand pennies. |
| **Model Ingestion** | Use Claude 3.5 Haiku instead of Textract AnalyzeExpense. | Cuts extraction costs by ~90% while adding support for Indian language receipts and non-standard invoice formats. |
| **Agent Reasoning** | Tiered invocation: Haiku for tools and extraction; Sonnet strictly for final conversational synthesis. | Balances low-latency, low-cost extraction loops with advanced reasoning only when generating final advice. |
| **Microservice Runtime** | Deploy App Runner with `min_instances = 0` (or pause during non-demo hours). | Eliminates persistent compute charges, billing only for active memory and CPU during test runs and demos. |
| **API & Compute** | Use Lambda On-Demand and HTTP APIs in API Gateway. | Zero baseline charges when idle; comfortably fits within the standard AWS monthly free allowances. |