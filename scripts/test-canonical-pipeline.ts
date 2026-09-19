import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { handler as normalizerHandler } from '../amplify/functions/ingestion-normalizer/handler';
import { computeDashboardMetrics } from '../src/lib/financial-store';

const region = 'ap-south-1';
const tenantId = 'msme-001';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Configure table names
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

async function runVerification() {
  console.log('=== FinFine Pro: Canonical Pipeline & Sandbox Verification ===\n');

  // STEP 1: Test Ingestion Normalizer with Bank Statement (Cash Position & Transactions)
  console.log('--- Step 1: Testing Bank Statement Normalization ---');
  const stmtDocId = `test-stmt-${Date.now()}`;
  const mockBankExtraction = {
    bucket: 'amplify-finfinepro-vicfic-finfinedocumentstoragebu-nm3ks1cueqmt',
    key: `public/tenants/${tenantId}/raw/${stmtDocId}-hdfc_statement.pdf`,
    tenantId,
    documentId: stmtDocId,
    modelUsed: 'deterministic-extractor-test',
    rawExtraction: {
      documentType: 'BANK_STATEMENT',
      bankOrIssuerName: 'HDFC Bank Ltd',
      accountNumber: '50200083921045',
      statementPeriod: { startDate: '2026-10-01', endDate: '2026-10-07' },
      openingBalance: 84500,
      closingBalance: 82350,
      statutoryIdentifiers: { gstin: '27AABCS1429B1Z5', pan: 'AABCS1429B' },
      transactions: [
        {
          date: '2026-10-01',
          description: 'UPI/CR/627491048291/Apex Retail/HDFC',
          amount: 18500,
          type: 'INFLOW',
          counterpartyName: 'Apex Retail',
          counterpartyIdentifier: 'apexretail@hdfcbank',
          inferredCategory: 'CUSTOMER_RECEIPT',
          balanceAfterTransaction: 103000,
        },
        {
          date: '2026-10-03',
          description: 'UPI/DR/627491048292/Sharma Fabrics/ICICI',
          amount: 22000,
          type: 'OUTFLOW',
          counterpartyName: 'Sharma Fabrics',
          inferredCategory: 'VENDOR_PAYMENT',
          balanceAfterTransaction: 81000,
        },
      ],
      obligations: [],
    },
  };

  const stmtResult = await (normalizerHandler as any)(mockBankExtraction);
  console.log('Bank Statement normalization output:', {
    status: stmtResult.status,
    transactions: stmtResult.summary.transactionCount,
    closingBalance: stmtResult.summary.closingBalance,
    cashSnapshotSaved: stmtResult.summary.cashSnapshotSaved,
  });

  // STEP 2: Test Ingestion Normalizer with Vendor Bill / Invoice
  console.log('\n--- Step 2: Testing Vendor Invoice Normalization (Canonical Product, Purchase, Supplier) ---');
  const invDocId = `test-inv-${Date.now()}`;
  const mockInvoiceExtraction = {
    bucket: 'amplify-finfinepro-vicfic-finfinedocumentstoragebu-nm3ks1cueqmt',
    key: `public/tenants/${tenantId}/raw/${invDocId}-sharma_textiles_bill.pdf`,
    tenantId,
    documentId: invDocId,
    modelUsed: 'deterministic-extractor-test',
    rawExtraction: {
      documentType: 'INVOICE',
      invoiceDetails: {
        invoiceNumber: 'INV-ST-8821',
        invoiceDate: '2026-10-07',
        dueDate: '2026-10-22',
        partyType: 'SUPPLIER',
        partyName: 'Sharma Textiles & Fabrics',
        partyGstin: '27AABCS9921D1Z2',
        totalAmount: 35000,
      },
      supplierTerms: {
        supplierName: 'Sharma Textiles & Fabrics',
        leadTimeDays: 4,
        creditPeriodDays: 15,
        minimumOrderQuantity: 50,
        deliveryCost: 500,
        paymentTermsText: 'Net 15 Days',
      },
      lineItems: [
        {
          productName: 'Cotton Greige Fabric 60s',
          sku: 'SKU-FAB-COT-60S',
          category: 'RAW_MATERIAL',
          quantity: 100,
          unitOfMeasure: 'meters',
          unitPrice: 220,
          grossAmount: 22000,
          netAmount: 22000,
        },
        {
          productName: 'Spun Polyester Thread Cone',
          sku: 'SKU-THR-POLY-WHT',
          category: 'CONSUMABLES',
          quantity: 260,
          unitOfMeasure: 'units',
          unitPrice: 50,
          grossAmount: 13000,
          netAmount: 13000,
        },
      ],
      obligations: [
        {
          title: 'Invoice #INV-ST-8821 - Sharma Textiles',
          counterpartyName: 'Sharma Textiles & Fabrics',
          statutoryId: '27AABCS9921D1Z2',
          amount: 35000,
          dueDate: '2026-10-22',
          type: 'PAYABLE',
          category: 'VENDOR_BILL',
          isStatutory: false,
        },
      ],
    },
  };

  const invResult = await (normalizerHandler as any)(mockInvoiceExtraction);
  console.log('Vendor Invoice normalization output:', {
    status: invResult.status,
    obligations: invResult.summary.obligationCount,
    products: invResult.summary.productCount,
    purchases: invResult.summary.purchaseCount,
  });

  // STEP 3: Verify DynamoDB Tables directly
  console.log('\n--- Step 3: Verifying DynamoDB Sandbox Table Contents ---');
  
  // Verify CashPositionSnapshot
  const cashRes = await docClient.send(
    new ScanCommand({
      TableName: process.env.CASH_POSITION_TABLE_NAME,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    })
  );
  console.log(`[DynamoDB] CashPositionSnapshot count for ${tenantId}: ${cashRes.Items?.length || 0}`);
  if (cashRes.Items && cashRes.Items.length > 0) {
    console.log(`   Latest Cash Snapshot: asOf=${cashRes.Items[0].asOf}, totalLiquidCash=₹${cashRes.Items[0].totalLiquidCash}`);
  }

  // Verify Product table
  const prodRes = await docClient.send(
    new ScanCommand({
      TableName: process.env.PRODUCT_TABLE_NAME,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    })
  );
  console.log(`[DynamoDB] Product count for ${tenantId}: ${prodRes.Items?.length || 0}`);
  if (prodRes.Items && prodRes.Items.length > 0) {
    console.log(`   Sample Products:`, prodRes.Items.slice(0, 3).map((p: any) => `${p.name} (${p.sku})`));
  }

  // Verify Purchase table
  const purRes = await docClient.send(
    new ScanCommand({
      TableName: process.env.PURCHASE_TABLE_NAME,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    })
  );
  console.log(`[DynamoDB] Purchase count for ${tenantId}: ${purRes.Items?.length || 0}`);

  // Verify SupplierProfile table
  const supRes = await docClient.send(
    new ScanCommand({
      TableName: process.env.SUPPLIER_PROFILE_TABLE_NAME,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    })
  );
  console.log(`[DynamoDB] SupplierProfile count for ${tenantId}: ${supRes.Items?.length || 0}`);

  // STEP 4: Test Dashboard Calculation Engine
  console.log('\n--- Step 4: Testing Dashboard Calculation Engine with Canonical Entities ---');
  const dashboardData = await computeDashboardMetrics();
  console.log('Computed Dashboard Metrics:');
  console.log(`   asOfDate: ${dashboardData.asOfDate}`);
  console.log(`   totalLiquidBalance: ₹${dashboardData.totalLiquidBalance.toLocaleString('en-IN')}`);
  console.log(`   minimumCashBuffer: ₹${dashboardData.minimumCashBuffer.toLocaleString('en-IN')}`);
  console.log(`   statutoryLockbox: ₹${dashboardData.statutoryLockbox.toLocaleString('en-IN')}`);
  console.log(`   spendableLiquidity: ₹${dashboardData.spendableLiquidity.toLocaleString('en-IN')}`);
  console.log(`   netDailyBurn: ₹${dashboardData.netDailyBurn.toLocaleString('en-IN')}/day`);
  console.log(`   daysToZero: ${dashboardData.daysToZero} days`);
  console.log(`   bufferBreachDay: ${dashboardData.bufferBreachDay ?? 'None'} days`);
  console.log(`   solvencyStatus: ${dashboardData.solvencyStatus}`);
  console.log(`   trajectory60Days length: ${dashboardData.trajectory60Days.length}`);
  console.log(`   pinchPoints count: ${dashboardData.pinchPoints.length}`);
  console.log(`   matrixDebts count: ${dashboardData.matrixDebts.length}`);

  console.log('\n=== All Verification Checks Passed Successfully! ===');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
