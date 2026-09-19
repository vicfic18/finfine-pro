# FinFine Pro: Normalized Financial Data Schema & System Storage Architecture

This document defines the **target data schema after normalization** and the **overall data storage architecture** for FinFine Pro, as specified in [ARCHITECTURE.md](file:///home/vicfic/prog/hacks/finfine-pro/docs/ARCHITECTURE.md).

---

## 1. End-to-End Data Pipeline Overview

The FinFine Pro data pipeline ingests unstructured and semi-structured Indian MSME financial artifacts (UPI bank statements, POS summaries, GST challans, paper invoices), extracts financial entities using multimodal AI models (such as `nvidia.nemotron-nano-12b-v2` and Claude Haiku), normalizes them into strict canonical structures, and persists them into a partitioned operational data layer.

```
┌─────────────────────────┐
│ Unstructured Artifacts  │
│ (PDF Statements, Invoices,
│  UPI QR Screenshots)    │
└───────────┬─────────────┘
            │ 1. Upload via Presigned URL
            ▼
┌────────────────────────────────────────────────────────┐
│ Amazon S3 (Raw Ingestion Bucket)                       │
│ s3://bucket/public/tenants/{tenantId}/raw/{docId}-file │
└───────────┬────────────────────────────────────────────┘
            │ 2. S3 ObjectCreated Event
            ▼
┌────────────────────────────────────────────────────────┐
│ Amazon EventBridge Rule & AWS Step Functions           │
│ Orchestrates Document Extractor & Ingestion Normalizer │
└───────────┬────────────────────────────────────────────┘
            │ 3. Multimodal LLM Extraction
            │    (nvidia.nemotron-nano-12b-v2 / Claude)
            ▼
┌────────────────────────────────────────────────────────┐
│ AWS Lambda: Ingestion Normalizer                       │
│ - Date standardization to ISO-8601                     │
│ - GSTIN / PAN statutory validation                    │
│ - UPI VPA & UTR decomposition                          │
│ - Priority Weight (w_i^type) computation               │
└───────────┬────────────────────────────────────────────┘
            │ 4. Batch Persistence
            ▼
┌────────────────────────────────────────────────────────┐
│ Amazon DynamoDB (Single-Table / Amplify Gen2 Data)     │
│ [DocumentRecord]  [Transaction]  [Obligation]          │
└───────────┬────────────────────────────────────────────┘
            │ 5. Read by Solvency Engine & Agent Core
            ▼
┌────────────────────────────────────────────────────────┐
│ Deterministic Solvency Engine (AWS App Runner / PuLP)  │
│ Computes Days-to-Zero & Optimal Obligation Settlement  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Target Schemas After Normalization

All raw model outputs undergo schema enforcement, validation, and enrichment in the Ingestion Normalizer before storage.

### 2.1 Entity: `DocumentRecord`
Represents an ingested document file, its extraction lifecycle status, statutory profile, and aggregate financial totals.

#### TypeScript Interface
```typescript
export interface NormalizedDocumentRecord {
  id: string; // Unique Document ID (e.g. doc-1789722402612)
  tenantId: string; // Logical Tenant Partition (e.g. msme-001)
  fileName: string; // Original uploaded file name
  s3Key: string; // S3 object key
  fileType: 'application/pdf' | 'image/jpeg' | 'image/png';
  documentType: 'BANK_STATEMENT' | 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'OTHER';
  status: 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED';
  extractedEntityCount: number; // Total transactions + obligations found
  rawMetadata: {
    bankOrIssuerName?: string; // e.g. "HDFC Bank", "ICICI Bank"
    accountNumber?: string; // Masked or full account number
    statementPeriod?: {
      startDate?: string; // ISO Date: YYYY-MM-DD
      endDate?: string; // ISO Date: YYYY-MM-DD
    };
    openingBalance?: number; // Starting balance in INR
    closingBalance?: number; // Closing balance in INR
    statutoryIdentifiers: {
      gstin?: string; // Validated 15-character GSTIN
      pan?: string; // Validated 10-character PAN
    };
    modelUsed: string; // Model ID used (e.g. nvidia.nemotron-nano-12b-v2)
    summary: {
      totalInflow: number; // Sum of credits in INR
      totalOutflow: number; // Sum of debits in INR
      transactionCount: number;
      obligationCount: number;
    };
  };
  errorMessage?: string;
  processedAt: string; // ISO-8601 Timestamp
  sourceRecordIds?: string[]; // Upstream lineage traceability
  createdAt: string;
  updatedAt: string;
}
```

#### JSON Sample
```json
{
  "id": "test-stmt-1789722402612",
  "tenantId": "msme-001",
  "fileName": "sample_upi_bank_statement.pdf",
  "s3Key": "public/tenants/msme-001/raw/test-stmt-1789722402612-sample_upi_bank_statement.pdf",
  "fileType": "application/pdf",
  "documentType": "BANK_STATEMENT",
  "status": "EXTRACTED",
  "extractedEntityCount": 7,
  "rawMetadata": {
    "bankOrIssuerName": "HDFC Bank",
    "accountNumber": "50200083921045",
    "statementPeriod": {
      "startDate": "2026-10-01",
      "endDate": "2026-10-07"
    },
    "openingBalance": 84500.0,
    "closingBalance": 82350.0,
    "statutoryIdentifiers": {
      "gstin": "27AABCS1429B1Z5",
      "pan": "AABCS1429B"
    },
    "modelUsed": "nvidia.nemotron-nano-12b-v2",
    "summary": {
      "totalInflow": 40800.0,
      "totalOutflow": 42950.0,
      "transactionCount": 7,
      "obligationCount": 0
    }
  },
  "processedAt": "2026-10-07T09:06:58.619Z",
  "createdAt": "2026-10-07T09:06:58.619Z",
  "updatedAt": "2026-10-07T09:06:58.619Z"
}
```

---

### 2.2 Entity: `Transaction`
Represents an immutable historical cash transaction extracted from bank statements or payment gateway receipts.

#### TypeScript Interface
```typescript
export interface NormalizedTransaction {
  id: string; // UUID primary key
  tenantId: string; // Logical tenant boundary (Partition Key)
  documentId: string; // Foreign reference to DocumentRecord
  date: string; // Standardized ISO-8601 Date: YYYY-MM-DD
  amount: number; // Absolute amount as positive float (INR)
  type: 'INFLOW' | 'OUTFLOW'; // INFLOW = Credit/Deposit, OUTFLOW = Debit/Withdrawal
  paymentMode: 'UPI' | 'NEFT' | 'IMPS' | 'CARD' | 'CASH' | 'CHEQUE' | 'AUTOPAY' | 'OTHER';
  counterpartyName: string; // Normalized vendor or customer name
  counterpartyIdentifier?: string; // UPI VPA (e.g. user@okaxis) or Account #
  category:
    | 'CUSTOMER_RECEIPT'
    | 'VENDOR_PAYMENT'
    | 'STATUTORY_TAX'
    | 'UTILITY'
    | 'SALARY'
    | 'OPERATING_EXPENSE'
    | 'LOAN_EMI'
    | 'OTHER';
  statutoryId?: string; // Validated GSTIN or PAN if applicable
  priorityWeight: number; // Weight (0.0 to 1.0) used by the MILP solver
  balanceAfterTransaction?: number; // Running balance after transaction (INR)
  referenceNumber?: string; // 12-digit UPI UTR/RRN, Cheque number, or IMPS Ref
  description: string; // Normalized narration string
  status: 'CONFIRMED' | 'PENDING' | 'RECONCILED';

  // Analytics Reconciliation References
  productId?: string;
  supplierId?: string;
  saleId?: string;
  purchaseId?: string;
  obligationId?: string;
  sourceRecordIds?: string[];

  createdAt: string;
  updatedAt: string;
}
```

#### JSON Sample (UPI Outflow - Statutory Tax)
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tenantId": "msme-001",
  "documentId": "test-stmt-1789722402612",
  "date": "2026-10-06",
  "amount": 15000.0,
  "type": "OUTFLOW",
  "paymentMode": "UPI",
  "counterpartyName": "GSTN CPIN TAX DEPOSIT",
  "counterpartyIdentifier": null,
  "category": "STATUTORY_TAX",
  "statutoryId": "27AABCS1429B1Z5",
  "priorityWeight": 1.0,
  "balanceAfterTransaction": 76800.0,
  "referenceNumber": "407813020202",
  "description": "UPI/NEFT/DR/407813020202/GSTN_CPIN_TAX_DEPOSIT_G",
  "status": "CONFIRMED",
  "createdAt": "2026-10-07T09:06:58.619Z",
  "updatedAt": "2026-10-07T09:06:58.619Z"
}
```

#### JSON Sample (UPI Inflow - Customer QR Collection)
```json
{
  "id": "c3f81e22-823d-4299-9b55-d144510b1a03",
  "tenantId": "msme-001",
  "documentId": "test-stmt-1789722402612",
  "date": "2026-10-01",
  "amount": 4250.0,
  "type": "INFLOW",
  "paymentMode": "UPI",
  "counterpartyName": "GPay Customer Rohan",
  "counterpartyIdentifier": "GPay_Customer_Rohan@okaxis",
  "category": "CUSTOMER_RECEIPT",
  "statutoryId": null,
  "priorityWeight": 0.6,
  "balanceAfterTransaction": 88750.0,
  "referenceNumber": "407812938192",
  "description": "UPI/CR/407812938192/GPay_Customer_Rohan@okaxis/QR_Payment",
  "status": "CONFIRMED",
  "createdAt": "2026-10-07T09:06:58.619Z",
  "updatedAt": "2026-10-07T09:06:58.619Z"
}
```

---

### 2.3 Entity: `Obligation`
Represents scheduled payables (bills, taxes, supplier invoices) or expected receivables (`type = "RECEIVABLE"`).

#### TypeScript Interface
```typescript
export interface NormalizedObligation {
  id: string; // UUID primary key
  tenantId: string; // Logical tenant boundary
  documentId?: string; // Source invoice/bill Document ID
  title: string; // Brief descriptive title
  counterpartyName: string; // Vendor, government department, or debtor
  statutoryId?: string; // GSTIN or PAN if applicable
  amount: number; // Obligation amount in INR
  dueDate: string; // Standardized ISO-8601 Date: YYYY-MM-DD
  type: 'PAYABLE' | 'RECEIVABLE';
  category:
    | 'GST_PAYMENT'
    | 'TDS_PAYMENT'
    | 'VENDOR_BILL'
    | 'UTILITY_BILL'
    | 'CUSTOMER_INVOICE'
    | 'SALARY'
    | 'OTHER';
  priorityWeight: number; // Solver priority weight (w_i^type)
  penaltyRatePerDay: number; // Penalty percentage per day of default (e.g. 0.0005 = 18% p.a.)
  isStatutory: boolean; // Hard constraint flag: statutory payments cannot be delayed
  status: 'SCHEDULED' | 'PAID' | 'OVERDUE' | 'DISPUTED';

  // Analytics Extensions & Receivable Fields
  supplierId?: string;
  productId?: string;
  allowPartialPayment?: boolean; // false / undefined = do not assume partial payment permitted
  expectedSettlementDate?: string; // Standardized ISO-8601 Date: YYYY-MM-DD
  probability?: number; // 0.0 - 1.0 (from explicit input or deterministic rule)
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityOverride?: number; // Explicit merchant override weight
  priorityOverrideReason?: string; // Traceability reason for override
  sourceRecordIds?: string[];

  createdAt: string;
  updatedAt: string;
}
```

---

### 2.4 Entity: `MerchantFinancialSettings`
Persists merchant operating constraints and liquidity buffer preferences.

#### TypeScript Interface
```typescript
export interface MerchantFinancialSettings {
  id: string;
  tenantId: string;
  minimumCashBuffer: number; // Absolute cash reserve in INR
  bufferRuleType?: 'ABSOLUTE_INR' | 'DAYS_OF_EXPENSE';
  defaultForecastHorizonDays?: number;
  defaultForecastHorizonWeeks?: number;
  enableConservativeFallbacks?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.5 Entity: `CashPositionSnapshot`
Provides an authoritative, point-in-time liquid cash baseline for cashflow analysis and solvency countdowns.

#### TypeScript Interface
```typescript
export interface CashPositionSnapshot {
  id: string;
  tenantId: string;
  asOf: string; // ISO Date: YYYY-MM-DD
  bankBalance: number; // Verified liquid bank balance in INR
  cashOnHand?: number; // Physical drawer cash in INR
  totalLiquidCash: number; // bankBalance + cashOnHand in INR
  sourceDocumentIds?: string[];
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.6 Entity: `Product`
Master product identity across sales, inventory snapshots, purchase orders, and supplier term comparisons.

#### TypeScript Interface
```typescript
export interface Product {
  id: string;
  tenantId: string;
  name: string; // Canonical product name
  sku?: string;
  category?: string;
  unitOfMeasure: string; // Canonical unit: 'kg', 'litre', 'pack', 'unit'
  isActive: boolean;
  aliases?: string[]; // Alternative document extraction aliases
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.7 Entity: `Sale` & `SaleLineItem`
Tracks commercial sales demand separately from realized customer cash receipts.

#### TypeScript Interface
```typescript
export interface Sale {
  id: string;
  tenantId: string;
  saleDate: string; // ISO Date: YYYY-MM-DD
  channel?: string; // 'RETAIL_COUNTER' | 'WHOLESALE' | 'ONLINE' | 'B2B'
  customerName?: string;
  grossAmount: number; // In INR
  discountAmount?: number; // In INR
  netSalesAmount: number; // In INR
  documentId?: string;
  sourceRecordIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleLineItem {
  id: string;
  tenantId: string;
  saleId: string;
  productId: string;
  quantity: number; // In product's canonical unitOfMeasure
  unitSellingPrice: number; // In INR
  grossAmount: number; // In INR
  discountAmount?: number; // In INR
  returnQuantity?: number;
  netSalesAmount: number; // In INR
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.8 Entity: `InventorySnapshot` & `InventoryItem`
Represents dated stock counts for stockout predictions and Days-of-Inventory (DIO) calculations.

#### TypeScript Interface
```typescript
export interface InventorySnapshot {
  id: string;
  tenantId: string;
  snapshotDate: string; // ISO Date: YYYY-MM-DD
  sourceType?: 'MANUAL' | 'DOCUMENT' | 'POS' | 'SYSTEM';
  documentId?: string;
  sourceRecordIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  inventorySnapshotId: string;
  productId: string;
  quantityOnHand: number; // In product's canonical unitOfMeasure
  unitPurchaseCost?: number; // In INR
  inventoryValue?: number; // quantityOnHand * unitPurchaseCost in INR
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.9 Entity: `Purchase` & `PurchaseLineItem`
Factual acquisition costs and quantities for historical margin analysis and supplier performance evaluation.

#### TypeScript Interface
```typescript
export interface Purchase {
  id: string;
  tenantId: string;
  purchaseDate: string; // ISO Date: YYYY-MM-DD
  supplierId?: string;
  supplierName?: string;
  totalAmount: number; // In INR
  documentId?: string;
  obligationId?: string;
  sourceRecordIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseLineItem {
  id: string;
  tenantId: string;
  purchaseId: string;
  productId: string;
  quantity: number; // In product's canonical unitOfMeasure
  unitPurchaseCost: number; // Factual acquisition cost in INR
  totalPurchaseAmount: number; // In INR
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.10 Entity: `SupplierProfile`
Captures supplier operational constraints required for procurement optimization.

#### TypeScript Interface
```typescript
export interface SupplierProfile {
  id: string;
  tenantId: string;
  supplierName: string;
  leadTimeDays?: number;
  creditPeriodDays?: number;
  minimumOrderQuantity?: number;
  deliveryCost?: number; // In INR
  paymentTermsText?: string;
  reliabilityScore?: number; // 0.0 to 1.0 (from explicit upstream process)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.11 Entity: `SupplierProductTerms`
Product-specific quotes, lead times, MOQ, and volume discounts per supplier.

#### TypeScript Interface
```typescript
export interface SupplierProductTerms {
  id: string;
  tenantId: string;
  supplierId: string;
  productId: string;
  quotedUnitPrice?: number; // In INR
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  discountPercent?: number; // e.g. 5.0 for 5%
  discountThresholdQuantity?: number;
  deliveryCost?: number; // In INR
  effectiveFrom?: string; // ISO Date: YYYY-MM-DD
  effectiveTo?: string; // ISO Date: YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.12 Entity: `PurchaseOrder` & `PurchaseOrderLineItem`
Open replenishment orders preventing duplicate stockout purchase recommendations.

#### TypeScript Interface
```typescript
export interface PurchaseOrder {
  id: string;
  tenantId: string;
  supplierId?: string;
  orderDate: string; // ISO Date: YYYY-MM-DD
  expectedDeliveryDate?: string; // ISO Date: YYYY-MM-DD
  status: 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  documentId?: string;
  sourceRecordIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLineItem {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  productId: string;
  orderedQuantity: number;
  receivedQuantity?: number;
  unitPurchaseCost?: number; // In INR
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.13 Entity: `RecurringExpense`
Predictable recurring operational expenses (rent, salaries, utility standing charges, subscriptions).

#### TypeScript Interface
```typescript
export interface RecurringExpense {
  id: string;
  tenantId: string;
  expenseType: string; // e.g., 'RENT', 'ELECTRICITY', 'PAYROLL', 'SUBSCRIPTION', 'TRANSPORT'
  amount: number; // In INR
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  dueDayOfMonth?: number; // 1 to 31
  startDate?: string; // ISO Date: YYYY-MM-DD
  endDate?: string; // ISO Date: YYYY-MM-DD
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. Normalization & Transformation Logic

The Normalizer Lambda executes four primary deterministic pipelines:

### 3.1 Date Standardization
Converts all regional date formats into ISO-8601 `YYYY-MM-DD`:
- Indian standard: `DD/MM/YYYY` or `DD-MM-YYYY` (e.g. `06/10/2026` $\rightarrow$ `2026-10-06`)
- Dot notation: `DD.MM.YYYY` (e.g. `06.10.2026` $\rightarrow$ `2026-10-06`)
- Standard ISO: `YYYY-MM-DD` preserved as-is.

### 3.2 Statutory Identifier Extraction & Validation
- **GSTIN (Goods and Services Tax Identification Number)**:
  - Format: 15 alphanumeric characters.
  - Regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
  - Extraction rule: Characters 3 to 12 automatically yield the business **PAN**.
- **PAN (Permanent Account Number)**:
  - Format: 10 alphanumeric characters.
  - Regex: `^[A-Z]{5}[0-9]{4}[A-Z]{1}$`

### 3.3 UPI Narration Decomposition
Extracts key metadata from bank narration strings:
- **UPI VPA Pattern**: Regex `[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+` (e.g. `merchant@okaxis`, `supplier@icici`).
- **UTR / RRN (Unique Transaction Reference)**: 12-digit numeric identifier `\b\d{12}\b`.
- **Directional Classification**: `UPI/CR` or `CR` tagged as `INFLOW`; `UPI/DR`, `DR`, `TAX_DEPOSIT`, `BillDesk` tagged as `OUTFLOW`.

### 3.4 Priority Weighting ($w_i^{\text{type}}$) Matrix
Used by the deterministic Mixed-Integer Linear Program (MILP) solver to prioritize payments under liquidity constraints:

| Category | Priority Weight ($w_i^{\text{type}}$) | Rationale & Constraint Type |
| :--- | :---: | :--- |
| **`STATUTORY_TAX`** | **1.00** | Non-negotiable legal obligation. Non-relaxable hard constraint. |
| **`UTILITY`** | **0.85** | Immediate operational risk (power, water, internet cutoff). |
| **`SALARY`** | **0.80** | Workforce continuity and critical operational retention. |
| **`LOAN_EMI`** | **0.75** | Credit score impact and institutional relationship preservation. |
| **`VENDOR_PAYMENT`** | **0.70** | Supply chain continuity; subject to relational flexibility negotiation. |
| **`CUSTOMER_RECEIPT`** | **0.60** | Realized inflows; verified against expected clearing dates. |
| **`OPERATING_EXPENSE`** | **0.50** | General business overheads, maintenance, logistics. |
| **`OTHER`** | **0.30** | Discretionary expenditures. |

### 3.5 Categorical Separation & Reconciliation Mapping
`TransactionCategory` and `ObligationCategory` represent distinct financial concepts and must remain separate enums.
When reconciliation between realized transactions and scheduled obligations is needed, the system applies an explicit deterministic mapping:

| Transaction Category | Obligation Category | Reconciliation Note |
| :--- | :--- | :--- |
| `CUSTOMER_RECEIPT` | `CUSTOMER_INVOICE` | Cash inflow matched to customer bill/invoice. |
| `VENDOR_PAYMENT` | `VENDOR_BILL` | Outflow matched to supplier purchase bill. |
| `STATUTORY_TAX` | `GST_PAYMENT` or `TDS_PAYMENT` | Requires statutory challan context; preserves ambiguity if unclassified. |
| `UTILITY` | `UTILITY_BILL` | Direct power/water/telecom bill reconciliation. |
| `SALARY` | `SALARY` | Payroll disbursement reconciliation. |
| `OPERATING_EXPENSE` | `OTHER` | General operational outflow. |
| `LOAN_EMI` | `OTHER` | Banking financing debt service. |
| `OTHER` | `OTHER` | Discretionary expense. |

### 3.6 Obligation Priority Rules & Overrides
The base priority matrix defines the starting weights for payables optimization:

| Obligation Category | Base Weight | Constraint Level |
| :--- | :---: | :--- |
| `GST_PAYMENT` | 1.00 | HARD (Non-relaxable legal penalty) |
| `TDS_PAYMENT` | 1.00 | HARD (Statutory deduction penalty) |
| `SALARY` | 0.90 | HIGH (Workforce continuity) |
| `UTILITY_BILL` | 0.85 | HIGH (Operational service cutoff) |
| `VENDOR_BILL` | 0.70 | MEDIUM (Subject to supplier credit terms) |
| `CUSTOMER_INVOICE` | 0.60 | INFO (Expected receivable inflow) |
| `OTHER` | 0.40 | LOW (Discretionary) |

Default weights live in skill configuration logic. When a merchant explicitly changes a priority, the override is persisted in `priorityOverride` accompanied by `priorityOverrideReason` for full explainability.

### 3.7 Money and Quantity Semantics
- **Currency**: Every monetary attribute strictly denotes **INR** (Indian Rupees). Field names reflect currency semantics without mixing units (`amount`, `grossAmount`, `netSalesAmount`, `unitSellingPrice`, `unitPurchaseCost`, `minimumCashBuffer`, `deliveryCost`).
- **Quantities**: Quantities must always correspond to the canonical `Product.unitOfMeasure` (e.g. `kg`, `litre`, `pack`, `unit`). Quantities must never be stored as unitless arbitrary numbers.

### 3.8 Source Traceability
All canonical entities derived from raw documents or upstream events carry:
- `documentId`: Foreign key to the source `DocumentRecord`.
- `sourceRecordIds`: String list capturing fine-grained record-level lineage (e.g. `["txn-101", "inv-202"]`) enabling auditability without narrative provenance.

---

## 4. Overall Application Data Storage Structure

The data storage layer is architected into three distinct tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Object Storage Tier (Amazon S3)                                     │
│    Immutable raw artifacts, presigned uploads, isolation               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ 2. Operational Database Tier (Amazon DynamoDB / Amplify Gen2 Data)     │
│    Canonical normalized state, GSIs, strict multi-tenant isolation     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ 3. Ephemeral Simulation Tier (AWS App Runner / Python Memory)          │
│    Counterfactual what-if scenarios, MILP matrices, transient states   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Tier 1: Amazon S3 (Immutable Object Store)
* **Bucket Configuration**: Managed by AWS Amplify Storage (`defineStorage`).
* **Multi-Tenant Key Prefix Structure**:
  ```text
  s3://<bucket-name>/public/tenants/{tenantId}/raw/{docId}-{sanitizedFileName}
  ```
* **Security & Isolation**:
  - Direct uploads from client via scoped presigned URLs.
  - S3 ObjectCreated events broadcast to EventBridge to decouple ingress from compute.
* **Lifecycle Rules**:
  - Raw statement files transition to Infrequent Access (S3 Standard-IA) after 30 days.
  - Expired / transient OCR artifacts delete after 90 days to satisfy the $100 budget envelope.

---

### Tier 2: Amazon DynamoDB (Operational Multi-Entity Storage)
* **Design Pattern**: Multi-model operational tables with strict tenant isolation and secondary indexes.
* **Billing Mode**: `PAY_PER_REQUEST` (On-Demand), eliminating idle baseline compute charges.
* **Amplify Data Construct**: Defined in [amplify/data/resource.ts](file:///home/vicfic/prog/hacks/finfine-pro/amplify/data/resource.ts).

#### Primary Key & Indexing Design

| Entity | Partition Key ($PK$) | Sort Key ($SK$) | Attributes & Usage |
| :--- | :--- | :--- | :--- |
| **`DocumentRecord`** | `TENANT#{tenantId}` | `DOC#{documentId}` | Tracks ingestion status, entity counts, raw metadata. |
| **`Transaction`** | `TENANT#{tenantId}` | `TXN#{date}#{txnId}` | Historical cash transactions. Range queries on date. |
| **`Obligation`** | `TENANT#{tenantId}` | `OBL#{dueDate}#{oblId}` | Scheduled liabilities and receivables sorted by due date. |
| **`MerchantFinancialSettings`**| `TENANT#{tenantId}` | `SETTINGS` | Merchant cash buffer constraints and forecast preferences. |
| **`CashPositionSnapshot`**| `TENANT#{tenantId}` | `CASH#{asOf}` | Authoritative starting liquid cash position. |
| **`Product`** | `TENANT#{tenantId}` | `PROD#{productId}` | Master product identity, unit of measure, aliases. |
| **`Sale`** | `TENANT#{tenantId}` | `SALE#{saleDate}#{saleId}` | Commercial demand sales records. |
| **`SaleLineItem`** | `TENANT#{tenantId}` | `SLI#{saleId}#{lineId}` | Product-level sales breakdown, prices, returns. |
| **`InventorySnapshot`** | `TENANT#{tenantId}` | `INV#{snapshotDate}#{id}`| Dated inventory observations. |
| **`InventoryItem`** | `TENANT#{tenantId}` | `INVI#{snapshotId}#{prodId}`| Stock-on-hand quantities and valuation. |
| **`Purchase`** | `TENANT#{tenantId}` | `PUR#{purchaseDate}#{id}`| Acquisition invoices and supplier transactions. |
| **`PurchaseLineItem`** | `TENANT#{tenantId}` | `PLI#{purchaseId}#{lineId}`| Unit cost and purchase quantity facts. |
| **`SupplierProfile`** | `TENANT#{tenantId}` | `SUPP#{supplierId}` | Supplier terms, lead times, credit periods, MOQ. |
| **`SupplierProductTerms`** | `TENANT#{tenantId}` | `SPT#{supplierId}#{prodId}`| Product-specific supplier quotes and discounts. |
| **`PurchaseOrder`** | `TENANT#{tenantId}` | `PO#{orderDate}#{poId}` | Open purchase replenishment orders. |
| **`PurchaseOrderLineItem`** | `TENANT#{tenantId}`| `POLI#{poId}#{lineId}` | Ordered vs received quantities. |
| **`RecurringExpense`** | `TENANT#{tenantId}` | `REC#{expenseType}#{id}` | Standing operational overheads (rent, salaries). |

#### Global Secondary Indexes (GSIs)

1. **`GSI-Temporal` (`tenantId` + `date` / `dueDate` / `saleDate`)**:
   - Temporal window queries for Solvency Countdown and cashflow projections.
2. **`GSI-Product` (`tenantId` + `productId`)**:
   - Fetch sales, stock levels, and purchase-cost history for a specific SKU.
3. **`GSI-Supplier` (`tenantId` + `supplierId`)**:
   - Lookup supplier profile, active terms, and outstanding purchase orders.

---

### Tier 3: In-Memory / Ephemeral Simulation State (AWS App Runner)
* **Isolation of Deterministic Arithmetic**:
  - LLMs are strictly barred from performing math or cash compounding.
  - When the user asks conversational what-if queries (e.g., *"Can I buy ₹60,000 equipment today?"*), parameters are sent to **AWS App Runner (FastAPI / PuLP)**.
* **Ephemeral Lifecycle**:
  - Hypothetical transactions (counterfactual purchases, delayed receivables) exist **only in memory during the execution of the solver**.
  - Persistent DynamoDB tables are **never mutated** by scenario simulations. Only confirmed real-world facts persist.

---

## 5. Summary Matrix of Stored Attributes

| Attribute | Type | Canonical Model | Purpose |
| :--- | :--- | :--- | :--- |
| `id` | String (UUID) | All Models | Unique primary key identifier. |
| `tenantId` | String | All Models | Multi-tenant logical isolation partition key. |
| `documentId` | String | All Derived Models | Traceability back to source artifact. |
| `sourceRecordIds` | String Array | All Models | Lineage tracking to upstream records. |
| `date` / `dueDate` | String (ISO) | Transaction / Obligation | Temporal index for Days-to-Zero and solvency. |
| `amount` | Float | Transaction / Obligation / Expense | Monetary figure strictly denominated in INR. |
| `minimumCashBuffer`| Float | MerchantFinancialSettings | Merchant liquidity reserve threshold in INR. |
| `bankBalance` / `cashOnHand` | Float | CashPositionSnapshot | Authoritative liquid cash breakdown in INR. |
| `unitOfMeasure` | String | Product | Canonical unit for all quantity fields (`kg`, `litre`, etc.). |
| `unitSellingPrice` / `unitPurchaseCost` | Float | SaleLineItem / PurchaseLineItem | Historical price/cost facts for margin analysis. |
| `quantityOnHand` | Float | InventoryItem | Current stock count in canonical `unitOfMeasure`. |
| `leadTimeDays` / `creditPeriodDays` | Integer | SupplierProfile | Procurement and payment constraint parameters. |
| `allowPartialPayment` | Boolean | Obligation | Explicit permission flag for partial invoice settlement. |
| `priorityOverride` | Float | Obligation | Explicit merchant override for solver base weights. |
