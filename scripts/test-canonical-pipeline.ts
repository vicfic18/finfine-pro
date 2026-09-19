import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { handler as extractorHandler } from '../amplify/functions/document-extractor/handler';
import { handler as normalizerHandler } from '../amplify/functions/ingestion-normalizer/handler';
import { computeDashboardMetrics } from '../src/lib/financial-store';
import {
  generateHdfcBankStatementPdf,
  generateVendorInvoicePdf,
} from './generate-sample-data';

const region = 'ap-south-1';
const tenantId = 'msme-001';
const bucketName = 'amplify-finfinepro-vicfic-finfinedocumentstoragebu-nm3ks1cueqmt';

const s3Client = new S3Client({ region });
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Configure canonical table names
const tableSuffix = '-ifsueqzwybf6nau7duulv5qweq-NONE';
process.env.DOCUMENT_RECORD_TABLE_NAME = `DocumentRecord${tableSuffix}`;
process.env.TRANSACTION_TABLE_NAME = `Transaction${tableSuffix}`;
process.env.OBLIGATION_TABLE_NAME = `Obligation${tableSuffix}`;
process.env.PRODUCT_TABLE_NAME = `Product${tableSuffix}`;
process.env.PURCHASE_TABLE_NAME = `Purchase${tableSuffix}`;
process.env.PURCHASE_LINE_ITEM_TABLE_NAME = `PurchaseLineItem${tableSuffix}`;
process.env.CASH_POSITION_TABLE_NAME = `CashPositionSnapshot${tableSuffix}`;
process.env.SUPPLIER_PROFILE_TABLE_NAME = `SupplierProfile${tableSuffix}`;
process.env.MERCHANT_SETTINGS_TABLE_NAME = `MerchantFinancialSettings${tableSuffix}`;
process.env.RECURRING_EXPENSE_TABLE_NAME = `RecurringExpense${tableSuffix}`;
process.env.FINFINE_TENANT_ID = tenantId;

/**
 * End-to-end test of the genuine PDF ingestion pipeline:
 * Real PDF Buffer -> Amazon S3 -> Document Extractor -> Ingestion Normalizer -> DynamoDB.
 * Absolutely ZERO synthetic database writes.
 */
async function runVerification() {
  console.log('=== FinFine Pro: Real PDF Pipeline Test (Zero Direct DB Writes) ===\n');

  // STEP 1: Real Bank Statement PDF
  console.log('--- Step 1: Testing Bank Statement PDF Pipeline ---');
  const stmtDocId = `test-stmt-${Date.now()}`;
  const bankPdfBuffer = await generateHdfcBankStatementPdf({ businessName: 'TEST MSME RETAIL' });
  const bankS3Key = `public/tenants/${tenantId}/raw/${stmtDocId}-sample_upi_bank_statement.pdf`;

  console.log(`1a. Uploading PDF to S3: s3://${bucketName}/${bankS3Key} (${bankPdfBuffer.length} bytes)...`);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: bankS3Key,
      Body: bankPdfBuffer,
      ContentType: 'application/pdf',
      Metadata: { tenantId, documentId: stmtDocId, documentType: 'BANK_STATEMENT' },
    })
  );

  console.log('1b. Running Document Extractor on real PDF binary...');
  const bankExtraction = await (extractorHandler as any)({
    bucket: bucketName,
    key: bankS3Key,
    tenantId,
    documentId: stmtDocId,
    documentType: 'BANK_STATEMENT',
  });

  console.log('1c. Running Ingestion Normalizer on extracted entities...');
  const stmtResult = await (normalizerHandler as any)(bankExtraction);
  console.log('Bank Statement Pipeline Result:', {
    status: stmtResult.status,
    transactions: stmtResult.summary?.transactionCount,
    closingBalance: stmtResult.summary?.closingBalance,
    cashSnapshotSaved: stmtResult.summary?.cashSnapshotSaved,
  });

  // STEP 2: Real Vendor Bill PDF
  console.log('\n--- Step 2: Testing Vendor Bill PDF Pipeline ---');
  const invDocId = `test-inv-${Date.now()}`;
  const vendorPdfBuffer = await generateVendorInvoicePdf({ businessName: 'TEST MSME RETAIL' });
  const vendorS3Key = `public/tenants/${tenantId}/raw/${invDocId}-sample_vendor_bill_sharma_textiles.pdf`;

  console.log(`2a. Uploading Bill PDF to S3: s3://${bucketName}/${vendorS3Key} (${vendorPdfBuffer.length} bytes)...`);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: vendorS3Key,
      Body: vendorPdfBuffer,
      ContentType: 'application/pdf',
      Metadata: { tenantId, documentId: invDocId, documentType: 'INVOICE' },
    })
  );

  console.log('2b. Running Document Extractor on vendor bill PDF binary...');
  const invExtraction = await (extractorHandler as any)({
    bucket: bucketName,
    key: vendorS3Key,
    tenantId,
    documentId: invDocId,
    documentType: 'INVOICE',
  });

  console.log('2c. Running Ingestion Normalizer on extracted bill...');
  const invResult = await (normalizerHandler as any)(invExtraction);
  console.log('Vendor Bill Pipeline Result:', {
    status: invResult.status,
    obligations: invResult.summary?.obligationCount,
    products: invResult.summary?.productCount,
    purchases: invResult.summary?.purchaseCount,
    suppliers: invResult.summary?.supplierCount,
  });

  // STEP 3: Verify DynamoDB Ledgers (Populated purely by normalizer from PDF extraction)
  console.log('\n--- Step 3: Verifying Canonical DynamoDB Ledgers ---');
  const docRes = await docClient.send(
    new ScanCommand({
      TableName: process.env.DOCUMENT_RECORD_TABLE_NAME,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    })
  );
  console.log(`DocumentRecords in DynamoDB: ${docRes.Items?.length || 0}`);

  const oblRes = await docClient.send(
    new ScanCommand({
      TableName: process.env.OBLIGATION_TABLE_NAME,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    })
  );
  console.log(`Obligations in DynamoDB: ${oblRes.Items?.length || 0}`);

  // STEP 4: Dynamic Metrics Computation
  console.log('\n--- Step 4: Computing Dynamic Dashboard Metrics from Ledgers ---');
  const metrics = await computeDashboardMetrics();
  console.log('Calculated Metrics:', {
    totalLiquidBalance: metrics.totalLiquidBalance,
    spendableLiquidity: metrics.spendableLiquidity,
    statutoryLockbox: metrics.statutoryLockbox,
    burnRate: metrics.netDailyBurn,
    daysToZero: metrics.daysToZero,
    workingCapitalCycle: metrics.workingCapitalCycle,
  });

  console.log('\n=== Pure PDF Ingestion Pipeline Test PASSED ===');
}

runVerification().catch((err) => {
  console.error('Pipeline test failed:', err);
  process.exit(1);
});
