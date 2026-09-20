# Ingestion integration contract

The upload route is an authenticated enqueue operation. It writes a PDF to
`tenants/{cognitoSub}/documents/{documentId}/{sanitizedFileName}` and creates a
`DocumentRecord` with `PENDING` status. It does not invoke a Lambda directly.
S3/EventBridge/Step Functions must pass `bucket`, `key`, `tenantId` (the
Cognito access-token `sub`), `documentId`, `purpose`, and `category` to the
extractor, then pass the extractor result unchanged to the normalizer.

Required configuration is `S3_BUCKET_NAME` and
`DOCUMENT_RECORD_TABLE_NAME` (or the corresponding Amplify outputs). The
normalizer writes optional canonical tables when these environment variables
are present: `TRANSACTION_TABLE_NAME`, `OBLIGATION_TABLE_NAME`,
`PRODUCT_TABLE_NAME`, `SUPPLIER_PROFILE_TABLE_NAME`, `PURCHASE_TABLE_NAME`,
`PURCHASE_LINE_ITEM_TABLE_NAME`, `SALE_TABLE_NAME`,
`INVENTORY_SNAPSHOT_TABLE_NAME`, `INVENTORY_ITEM_TABLE_NAME`, and
`RECURRING_EXPENSE_TABLE_NAME`.

The pipeline accepts only objects with a `%PDF-` signature, a `.pdf` key, and a
size of at most 10 MB. Raw extraction is retained under `rawMetadata` and is
never mutated by the normalizer. Validation issues and merchant corrections
must remain separate records; this workstream does not write corrections.
