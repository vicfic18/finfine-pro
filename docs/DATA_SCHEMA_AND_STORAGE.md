# FinFine Pro data schema and storage

The authoritative deployed schema is `amplify/data/resource.ts`. The related
TypeScript interfaces in `src/types/canonical-schema.ts` describe the same
financial vocabulary for analytics code, but the Amplify model definitions win
when the two differ.

## Data flow

```text
Authenticated PDF upload
  → S3: tenants/{sub}/documents/{documentId}/{file}
  → DocumentRecord: PENDING
  → EventBridge / Step Functions
  → deterministic extractor result
  → normalizer validation and projections
  → tenant-scoped DynamoDB model records

Agent and dashboard reads
  → direct DynamoDB scans with tenantId filters
  → dashboard metrics / forecast / read-only agent tools
```

All monetary values are INR amounts represented as DynamoDB numbers. Dates used
by financial records are strings in `YYYY-MM-DD` form; timestamps are ISO
datetimes.

## Common identity and authorization fields

Every `a.model()` has an Amplify-generated `id`; application-created records
also carry `createdAt` and `updatedAt`. The financial models include a required
`tenantId` and normally use:

```ts
allow.ownerDefinedIn('tenantId').identityClaim('sub')
```

The `sub` is the verified Cognito access-token subject. Server-side readers also
apply `tenantId = :tenantId` filters. `RecurringExpense` currently allows
guest and authenticated access and should be treated as an exception requiring
additional review.

The current `a.model()` definitions create separate Amplify Data/AppSync-backed
DynamoDB resources. This repository does not define the single-table primary-key
layout or custom GSIs described in older design documents; many server readers
currently use `ScanCommand` with tenant filters.

## Amplify data models

The following matrix summarizes the fields in `amplify/data/resource.ts`. A
field marked `required` is required by the model definition; all other fields
are optional unless the application code adds its own validation.

| Model | Fields |
| --- | --- |
| `DocumentRecord` | `tenantId` (required), `fileName`, `s3Key` (required), `fileType`, `documentType`, `status` (required), `extractedEntityCount`, `rawMetadata`, `errorMessage`, `processedAt`, `sourceRecordIds[]`, `purpose`, `category`, `detectedCategories[]`, `reportingStartDate`, `reportingEndDate`, `reportingPeriod`, `validationStatus`, `validationIssues[]`, `readinessLink` |
| `Transaction` | `tenantId`, `documentId`, `date` (required), `amount` (required), `type` (required), `paymentMode`, `counterpartyName`, `counterpartyIdentifier`, `category`, `statutoryId`, `priorityWeight`, `balanceAfterTransaction`, `referenceNumber`, `description`, `status`, `productId`, `supplierId`, `saleId`, `purchaseId`, `obligationId`, `sourceRecordIds[]` |
| `Obligation` | `tenantId`, `documentId`, `title` (required), `counterpartyName`, `statutoryId`, `amount` (required), `dueDate`, `type` (required), `category`, `priorityWeight`, `penaltyRatePerDay`, `isStatutory`, `status`, `supplierId`, `productId`, `allowPartialPayment`, `expectedSettlementDate`, `probability`, `confidence`, `priorityOverride`, `priorityOverrideReason`, `sourceRecordIds[]` |
| `MerchantFinancialSettings` | `tenantId`, `businessName`, `tradeName`, `gstin`, `pan`, `category`, `minimumCashBuffer` (required), `bufferRuleType`, `defaultForecastHorizonDays`, `defaultForecastHorizonWeeks`, `lowRunwayAlertDays`, `enableConservativeFallbacks` |
| `CashPositionSnapshot` | `tenantId`, `asOf` (required), `bankBalance` (required), `cashOnHand`, `totalLiquidCash` (required), `sourceDocumentIds[]` |
| `Product` | `tenantId`, `name` (required), `sku`, `category`, `unitOfMeasure` (required), `isActive` (required), `aliases[]` |
| `Sale` | `tenantId`, `saleDate` (required), `channel`, `customerName`, `grossAmount` (required), `discountAmount`, `netSalesAmount` (required), `documentId`, `sourceRecordIds[]` |
| `SaleLineItem` | `tenantId`, `saleId` (required), `productId` (required), `quantity` (required), `unitSellingPrice` (required), `grossAmount` (required), `discountAmount`, `returnQuantity`, `netSalesAmount` (required) |
| `InventorySnapshot` | `tenantId`, `snapshotDate` (required), `sourceType`, `documentId`, `sourceRecordIds[]` |
| `InventoryItem` | `tenantId`, `inventorySnapshotId` (required), `productId` (required), `quantityOnHand` (required), `unitPurchaseCost`, `inventoryValue` |
| `Purchase` | `tenantId`, `purchaseDate` (required), `supplierId`, `supplierName`, `totalAmount` (required), `documentId`, `obligationId`, `sourceRecordIds[]` |
| `PurchaseLineItem` | `tenantId`, `purchaseId` (required), `productId` (required), `quantity` (required), `unitPurchaseCost` (required), `totalPurchaseAmount` (required) |
| `SupplierProfile` | `tenantId`, `supplierName` (required), `leadTimeDays`, `creditPeriodDays`, `minimumOrderQuantity`, `deliveryCost`, `paymentTermsText`, `reliabilityScore`, `notes` |
| `SupplierProductTerms` | `tenantId`, `supplierId` (required), `productId` (required), `quotedUnitPrice`, `minimumOrderQuantity`, `leadTimeDays`, `discountPercent`, `discountThresholdQuantity`, `deliveryCost`, `effectiveFrom`, `effectiveTo` |
| `PurchaseOrder` | `tenantId`, `supplierId`, `orderDate` (required), `expectedDeliveryDate`, `status` (required), `documentId`, `sourceRecordIds[]` |
| `PurchaseOrderLineItem` | `tenantId`, `purchaseOrderId` (required), `productId` (required), `orderedQuantity` (required), `receivedQuantity`, `unitPurchaseCost` |
| `RecurringExpense` | `tenantId`, `expenseType` (required), `amount` (required), `frequency` (required), `dueDayOfMonth`, `startDate`, `endDate`, `isActive` (required), `notes`, `linkedObligationCategory`, `counterpartyName` |
| `CashFlowPrediction` | `tenantId`, `generatedAt` (required), `horizonDays` (required), `modelName` (required), `engine` (required), `festiveUpliftInr`, `statutoryTaxDrainInr`, `dailyForecasts`, `solvencySummary` |
| `MerchantOnboarding` | `tenantId`, `status` (required), `currentStep` (required), `profile`, `financialSettings`, `applicableCategories[]`, `coverage`, `attestations`, `confirmations`, `readiness`, `completedAt` |
| `MerchantFieldConfirmation` | `tenantId`, `documentId` (required), `category` (required), `fieldPath` (required), `extractedValue`, `confirmedValue` (required), `correctionType` (required), `reason`, `asOf` (required), `confirmedBy` (required), `confirmedAt` (required) |
| `ExpectedReceivable` | `tenantId`, `customerName` (required), `amount` (required), `dueDate`, `confidence`, `sourceDocumentId` |

### Enumerations used by the application

The model fields are strings rather than GraphQL enums. Current application
conventions include:

- transaction types: `INFLOW`, `OUTFLOW`;
- obligation types: `PAYABLE`, `RECEIVABLE`;
- transaction categories: `CUSTOMER_RECEIPT`, `VENDOR_PAYMENT`,
  `STATUTORY_TAX`, `UTILITY`, `SALARY`, `OPERATING_EXPENSE`, `LOAN_EMI`,
  `OTHER`;
- obligation categories: `GST_PAYMENT`, `TDS_PAYMENT`, `VENDOR_BILL`,
  `UTILITY_BILL`, `CUSTOMER_INVOICE`, `SALARY`, `OTHER`;
- payment modes: `UPI`, `NEFT`, `IMPS`, `CARD`, `CASH`, `CHEQUE`, `AUTOPAY`,
  `OTHER`;
- inventory source types: `MANUAL`, `DOCUMENT`, `POS`, `SYSTEM`; and
- recurring expense frequencies: `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`.

## Extraction and normalization rules

The active extraction path is `unpdf` plus local parsers. It does not perform
OCR or invoke Bedrock. The normalizer applies the following rules.

### Dates, amounts, and identifiers

- ISO and `YYYY/MM/DD`-style values are normalized to `YYYY-MM-DD`.
- `DD/MM/YYYY`, `DD-MM-YYYY`, and dotted day-first values are also accepted.
- Amount strings may contain commas, `₹`, `INR`, or `Rs.` and are rounded to
  two decimal places. Negative/invalid normalized amounts are skipped when a
  persisted record requires a non-negative amount.
- GSTIN and PAN are checked with the regexes in the normalizer. A valid GSTIN
  supplies its embedded PAN when one is not separately present.

### Validation issues

The normalizer preserves extractor issues and adds issues such as:

`CURRENCY_NOT_INR`, `MISSING_REPORTING_PERIOD`,
`REPORTING_PERIOD_INVALID`, `REPORTING_PERIOD_SHORT_OF_90_DAYS`,
`INVALID_TRANSACTION_AMOUNT`, `TRANSACTION_DATE_UNRESOLVED`,
`DUPLICATE_SOURCE_ID`, `INVALID_OBLIGATION_AMOUNT`,
`OBLIGATION_DATE_UNRESOLVED`, `OBLIGATION_DIRECTION_INVALID`,
`PRODUCT_IDENTITY_MISSING`, `INVALID_UNIT_QUANTITY`, `LINE_TOTAL_MISMATCH`,
and `BALANCE_RECONCILIATION_FAILED`.

Bank activity, product sales, and supplier-purchase categories require a
reporting period. Periods shorter than 90 days are flagged. A bank statement
cash snapshot is written only when it has a closing balance, an end date, and no
validation issues.

### Priority weights

The active normalizer assigns these base weights to derived transaction and
obligation categories:

| Category | Weight |
| --- | ---: |
| `STATUTORY_TAX`, `GST_PAYMENT`, `TDS_PAYMENT` | 1.00 |
| `SALARY` | 0.90 |
| `UTILITY`, `UTILITY_BILL` | 0.85 |
| `VENDOR_PAYMENT`, `VENDOR_BILL` | 0.70 |
| `CUSTOMER_RECEIPT` | 0.65 |
| `CUSTOMER_INVOICE` | 0.60 |
| `OTHER` | 0.40 |

These weights are data attributes used by later analytics. The repository does
not currently contain a general MILP payment solver.

### Lineage and corrections

Derived records normally retain `documentId` and/or `sourceRecordIds`. The
original extractor payload is kept inside `DocumentRecord.rawMetadata`. Review
corrections are append-only `MerchantFieldConfirmation` records; they do not
overwrite the extracted payload.

## Persistence behavior

### S3 object storage

`amplify/storage/resource.ts` creates the document/session bucket with no
browser object access rules. The supported server-mediated PDF key is:

```text
tenants/{tenantId}/documents/{documentId}/{sanitizedFileName}
```

The bucket is configured for AES-256 server-side encryption. The agent runtime
uses a separate private prefix:

```text
agent-sessions/
  metadata/{opaque-storage-id}.json
  idempotency/{request-id}.json
  conversations/{owner-digest}/index.json
  conversations/{owner-digest}/{session-id}.json
  {opaque-storage-id}/...              # Strands snapshots
```

Only the server/agent roles access these prefixes. The agent-session prefix has
a configurable lifecycle expiration, 30 days by default.

The route's legacy sample/bulk branch uses `public/tenants/.../raw/...`; that
shape is not accepted by the active extractor and is not the canonical storage
contract.

### DynamoDB and AppSync

Amplify Data provisions the model resources and AppSync API. The Next.js server
and agent backend also use the AWS SDK directly. Current stores mostly use
tenant-filtered scans; there is no checked-in custom GSI schema.

The normalizer writes `DocumentRecord`, `Transaction`, `Obligation`, `Product`,
`SupplierProfile`, `Purchase`, `PurchaseLineItem`, `Sale`,
`CashPositionSnapshot`, `InventorySnapshot`, `InventoryItem`, and
`RecurringExpense` when their table names are configured. It does not yet
populate all 21 models. Onboarding and correction APIs write their own model
records, and the statutory/tax services synchronize additional obligations.

### Ephemeral and derived state

- `financial-store.ts` keeps a per-tenant in-process dashboard cache for 60
  seconds. It is invalidated after settings, obligations, ingestion, or reset
  operations.
- The embedded forecast is computed in memory and is not automatically written
  to `CashFlowPrediction` by the current dashboard path.
- Agent CSV artifacts live in a process-local temporary directory for one
  agent process and are referenced by opaque IDs.
- Scenario inputs passed to the agent forecast tool are calculations only; they
  do not mutate canonical records.

## Standalone DynamoDB tables

These tables are used by source code but are not `a.model()` definitions:

| Table | Role |
| --- | --- |
| `StatutoryAdvisory` | Seeded/read by the statutory advisory service and daily Lambda. |
| `TaxComplianceRule` | Tax rule catalog used by the compliance store and procurement script. |
| `MarketCalendarEvent` | Festival/market calendar used by the forecast and compliance code. |

The tax compliance store also stores a `taxProfile` JSON object inside the
merchant settings record and synchronizes selected rules into `Obligation`.
Physical names should be configured through environment variables or generated
Amplify outputs.

## Source map

- Amplify models and authorization: `amplify/data/resource.ts`
- Canonical analytics interfaces: `src/types/canonical-schema.ts`
- Extractor: `amplify/functions/document-extractor/handler.ts`
- Normalizer: `amplify/functions/ingestion-normalizer/handler.ts`
- Upload/status/correction APIs: `src/app/api/ingestion/`
- Dashboard projections: `src/lib/financial-store.ts`
- Agent dataset readers: `agent_backend/finfine_agent/dynamodb.py` and
  `agent_backend/finfine_agent/tools/financial_data.py`
