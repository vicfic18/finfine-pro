# Document ingestion integration contract

This contract describes the supported authenticated upload path implemented by
`src/app/api/ingestion/upload/route.ts` and the asynchronous AWS pipeline in
`amplify/backend.ts`.

## Supported upload request

Send a `multipart/form-data` request to `POST /api/ingestion/upload` through
`authenticatedFetch()`:

| Field | Required | Values / behavior |
| --- | --- | --- |
| `file` | yes | One PDF for onboarding or periodic updates. |
| `purpose` | yes for canonical flow | `ONBOARDING_BASELINE` or `PERIODIC_UPDATE`. |
| `category` | yes for canonical flow | `BANK_ACTIVITY`, `PRODUCT_SALES`, `CURRENT_INVENTORY`, `PURCHASES_SUPPLIERS`, `PURCHASES`, `OPEN_OBLIGATIONS`, or `RECURRING_EXPENSES`. `PURCHASES` is canonicalized to `PURCHASES_SUPPLIERS`. |

The route obtains the tenant from the verified Cognito access-token `sub`; a
caller cannot select it in the form. `PERIODIC_UPDATE` requires completed
onboarding.

Validation rules:

- `file.type` must be `application/pdf`;
- size must be between 1 byte and 10 MiB;
- the first five bytes must be `%PDF-`; and
- the sanitized filename is limited to 180 characters and cannot contain path
  traversal.

The route creates a pending manifest before uploading the object. The canonical
object key is:

```text
tenants/{cognitoSub}/documents/{documentId}/{sanitizedFileName}
```

The initial `DocumentRecord` includes `tenantId`, `s3Key`, `purpose`,
`category`, `status: PENDING`, `validationStatus: PENDING`, and empty validation
issues. The S3 upload uses AES-256 server-side encryption. On upload failure,
the route attempts to delete the pending record. A successful enqueue returns:

```http
202 Accepted
```

```json
{ "documentId": "<uuid>", "status": "PENDING" }
```

The route does not wait for extraction or normalization.

## AWS event contract

The EventBridge rule matches S3 `Object Created` events for the deployed bucket
when the key begins with `tenants/`. The event only needs to preserve the S3
bucket and object key. The extractor accepts these equivalent input shapes:

```json
{
  "detail": {
    "bucket": { "name": "<bucket>" },
    "object": { "key": "tenants/<sub>/documents/<documentId>/<file>.pdf" }
  }
}
```

or:

```json
{
  "bucket": "<bucket>",
  "key": "tenants/<sub>/documents/<documentId>/<file>.pdf"
}
```

The extractor derives `tenantId` and `documentId` from the key and reads the
authoritative `DocumentRecord` manifest using `DOCUMENT_RECORD_TABLE_NAME`.
Optional event values for `tenantId` and `documentId` must agree with the key;
purpose and category come from the manifest rather than from an untrusted event
payload.

## Step Functions pipeline

`finfine-document-ingestion-pipeline` is a sequential two-task state machine:

1. `ExtractDocumentDataTask` invokes `document-extractor` with a 120-second
   task timeout and up to three retries for service/task failures.
2. `NormalizeAndPersistTask` receives the extractor payload unchanged. It has a
   60-second task timeout and up to two retries.

The overall state-machine timeout is five minutes. The generated extractor
payload has this shape:

```json
{
  "statusCode": 200,
  "bucket": "<bucket>",
  "key": "tenants/<sub>/documents/<documentId>/<file>.pdf",
  "tenantId": "<cognito-sub>",
  "documentId": "<uuid>",
  "purpose": "ONBOARDING_BASELINE",
  "category": "BANK_ACTIVITY",
  "extractor": "unpdf-local",
  "rawExtraction": { "documentType": "BANK_STATEMENT", "transactions": [], "obligations": [] },
  "extractedAt": "<ISO timestamp>"
}
```

## Extractor behavior

`amplify/functions/document-extractor/handler.ts` is a deterministic local PDF
parser. It:

- accepts only `.pdf` keys and validates the `%PDF-` signature;
- limits files to 10 MiB, 100 pages, 200,000 text items, and 2,000,000 text
  characters;
- limits the local extraction operation to 90 seconds;
- extracts page/row/source-text provenance from embedded text or positioned
  text items;
- recognizes bank statements, invoices/receipts, sales, inventory, purchase,
  obligation, and recurring-expense patterns; and
- extracts GSTIN/PAN candidates, balances, dates, transactions, obligations,
  line items, supplier terms, inventory items, and recurring expenses when the
  text matches its supported patterns.

Image-only PDFs do not go through OCR. They produce
`SCANNED_PDF_NO_TEXT_OCR_UNAVAILABLE` and should be reviewed or replaced with a
text-bearing export. `bedrock-vision.ts` contains a dormant implementation but
is not part of the active handler path.

## Normalizer behavior

`amplify/functions/ingestion-normalizer/handler.ts` requires a tenant-scoped
key matching:

```text
tenants/{tenantId}/documents/{documentId}/...
```

It then:

1. normalizes ISO and `DD/MM/YYYY`-style dates to `YYYY-MM-DD`;
2. normalizes INR amounts to non-negative values rounded to two decimals;
3. validates GSTIN and PAN shapes and derives PAN from GSTIN when present;
4. validates reporting periods, requiring a period for bank activity, product
   sales, and supplier-purchase categories;
5. flags periods shorter than 90 days, invalid transaction/obligation dates,
   duplicate transaction references, line-total mismatches, and failed bank
   balance reconciliation;
6. assigns deterministic priority weights to recognized categories; and
7. writes the document record and derived canonical records in DynamoDB.

The current priority map is:

| Category | Weight |
| --- | ---: |
| `STATUTORY_TAX`, `GST_PAYMENT`, `TDS_PAYMENT` | 1.00 |
| `SALARY` | 0.90 |
| `UTILITY`, `UTILITY_BILL` | 0.85 |
| `VENDOR_PAYMENT`, `VENDOR_BILL` | 0.70 |
| `CUSTOMER_RECEIPT` | 0.65 |
| `CUSTOMER_INVOICE` | 0.60 |
| `OTHER` | 0.40 |

Validation issues are retained in `DocumentRecord.validationIssues` and inside
`rawMetadata`. A clean bank statement can produce a `CashPositionSnapshot`;
otherwise the normalizer still persists the document and valid derived records
with `validationStatus: NEEDS_REVIEW`.

The handler currently writes these derived model families when the corresponding
table environment variable is configured: `Transaction`, `Obligation`,
`Product`, `SupplierProfile`, `Purchase`, `PurchaseLineItem`, `Sale`,
`CashPositionSnapshot`, `InventorySnapshot`, `InventoryItem`, and
`RecurringExpense`. It does not yet populate every model in the Amplify schema,
including purchase orders, supplier-product terms, sale line items, onboarding,
field confirmations, or expected receivables.

## Document status and review APIs

`GET /api/ingestion/documents` scans tenant documents and exposes grouped bank
statements, bills/invoices, normalized public metadata, and status counts.

`GET /api/ingestion/documents/{documentId}` returns a safe extraction view after
checking the authenticated tenant. The review UI can call:

```http
PATCH /api/ingestion/documents/{documentId}
```

with a `corrections` array of at most 100 entries. Corrections are appended to
`MerchantFieldConfirmation`; the original extracted `rawMetadata` is not
rewritten. Each accepted entry records category, field path, extracted value,
confirmed value, correction type, reason, as-of date, confirmer, and timestamp.

## Configuration

The route and functions prefer environment variables and then custom Amplify
outputs. At minimum, the runtime needs:

```text
AWS_REGION
S3_BUCKET_NAME
DOCUMENT_RECORD_TABLE_NAME
```

The normalizer additionally receives table names for the canonical entities from
`amplify/backend.ts`, including transaction, obligation, product, supplier,
purchase, sale, cash, inventory, recurring-expense, onboarding, confirmation,
and expected-receivable tables. Physical table names should come from the
generated outputs rather than copied documentation.

## Legacy branches to avoid for new integrations

The same route still contains JSON/sample-data and older bulk multipart
branches. They upload to keys shaped like:

```text
public/tenants/{tenantId}/raw/{documentId}-{fileName}
```

and try to invoke the extractor/normalizer directly, with a local handler
fallback. The active extractor rejects that key shape because it requires
`tenants/{tenantId}/documents/{documentId}/...`. Those branches are useful as
legacy/demo code but are not compatible with the EventBridge contract. New
clients should use the purpose/category upload path above until the legacy
branches are aligned or removed.
