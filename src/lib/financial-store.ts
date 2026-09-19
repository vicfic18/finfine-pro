import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';

// DynamoDB Table Names
const docTableName = process.env.DOCUMENT_RECORD_TABLE_NAME || 'DocumentRecord-ifsueqzwybf6nau7duulv5qweq-NONE';
const txnTableName = process.env.TRANSACTION_TABLE_NAME || 'Transaction-ifsueqzwybf6nau7duulv5qweq-NONE';
const obTableName = process.env.OBLIGATION_TABLE_NAME || 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';
const cashPositionTableName = process.env.CASH_POSITION_TABLE_NAME || 'CashPositionSnapshot-ifsueqzwybf6nau7duulv5qweq-NONE';
const merchantSettingsTableName = process.env.MERCHANT_SETTINGS_TABLE_NAME || 'MerchantFinancialSettings-ifsueqzwybf6nau7duulv5qweq-NONE';
const recurringExpenseTableName = process.env.RECURRING_EXPENSE_TABLE_NAME || 'RecurringExpense-ifsueqzwybf6nau7duulv5qweq-NONE';
const productTableName = process.env.PRODUCT_TABLE_NAME || 'Product-ifsueqzwybf6nau7duulv5qweq-NONE';
const purchaseTableName = process.env.PURCHASE_TABLE_NAME || 'Purchase-ifsueqzwybf6nau7duulv5qweq-NONE';
const supplierProfileTableName = process.env.SUPPLIER_PROFILE_TABLE_NAME || 'SupplierProfile-ifsueqzwybf6nau7duulv5qweq-NONE';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Snapshot & Memory Cache Configuration
export const SNAPSHOT_KEY_PREFIX = 'snapshot#';
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let memoryCachedData: FinancialMetricData | null = null;
let memoryCachedTimestamp = 0;

export function invalidateDashboardCache(): void {
  memoryCachedData = null;
  memoryCachedTimestamp = 0;
}

export interface FinancialMetricData {
  asOfDate: string;
  totalLiquidBalance: number;
  spendableLiquidity: number;
  minimumCashBuffer: number;
  bufferBreachDay: number | null;
  statutoryLockbox: number;
  statutoryBreakdown: {
    gst: number;
    tds: number;
    pfEsic: number;
    advanceTax: number;
  };
  netDailyBurn: number;
  daysToZero: number;
  solvencyStatus: 'Safe' | 'Warning' | 'Critical';
  liquidityStressRatio: number;
  inflowsNext15Days: number;
  commitmentsNext15Days: number;
  fixedObligationsTotal: number;
  variableObligationsTotal: number;
  fixedPercentageOfExpectedInflow: number;
  workingCapitalCycle: {
    dso: number;
    dio: number;
    dpo: number;
    ccc: number;
  };
  trajectory60Days: Array<{
    day: number;
    date: string;
    baseBalance: number;
    optimisticBalance: number;
    conservativeBalance: number;
    netDelta: number;
    inflow: number;
    outflow: number;
    events: string[];
  }>;
  pinchPoints: Array<{
    date: string;
    dayNum: number;
    dayName: string;
    netDelta: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    title: string;
    amount: number;
    category: string;
    details: string;
  }>;
  matrixDebts: Array<{
    id: string;
    name: string;
    amount: number;
    type: 'PAYABLE' | 'RECEIVABLE';
    daysDue: number; // positive = days until due, negative = days overdue
    urgencyScore: number; // 0 to 100
    penaltyRisk: 'High' | 'Medium' | 'Zero';
    quadrant: 'IMMEDIATE_PAY' | 'FLEXIBLE_PAY' | 'URGENT_COLLECT' | 'SAFE_FLOAT';
    category: string;
  }>;
  debtorsReliability: Array<{
    name: string;
    amountDue: number;
    agreedDue: string;
    expectedRealisticDate: string;
    averageDelayDays: number;
    concentrationPercentage: number;
    reliabilityScore: number;
  }>;
  paymentRailSavings: {
    monthlyVolume: number;
    currentEstimatedFees: number;
    optimizedFees: number;
    monthlySavings: number;
    recommendations: Array<{
      vendor: string;
      amount: number;
      bestRail: string;
      avoidRail: string;
      savings: number;
    }>;
  };
  discountArbitrage: Array<{
    supplierName: string;
    billAmount: number;
    discountPercent: number;
    discountExpiryDays: number;
    instantSavings: number;
    annualizedReturn: number;
    canAffordNow: boolean;
    recommendation: string;
  }>;
  statutoryCompliance: Array<{
    taxName: string;
    form: string;
    dueDate: string;
    daysLeft: number;
    amountDue: number;
    status: 'Upcoming' | 'Urgent' | 'Delayed';
    penaltyIfMissedDaily: string;
  }>;
}

/**
 * Persists a calculated dashboard snapshot record into DynamoDB DocumentRecord table.
 * Uses a deterministic primary key id: snapshot#{tenantId} for instant O(1) GetItem.
 */
export async function saveDashboardSnapshot(
  data: FinancialMetricData,
  targetTenantId = tenantId
): Promise<void> {
  if (!docTableName) return;
  const nowIso = new Date().toISOString();
  const snapshotId = `${SNAPSHOT_KEY_PREFIX}${targetTenantId}`;

  await docClient.send(
    new PutCommand({
      TableName: docTableName,
      Item: {
        id: snapshotId,
        tenantId: targetTenantId,
        documentType: 'DASHBOARD_SNAPSHOT',
        status: 'COMPLETED',
        s3Key: `snapshots/${targetTenantId}.json`,
        fileName: `dashboard-snapshot-${targetTenantId}.json`,
        rawMetadata: JSON.stringify(data),
        processedAt: nowIso,
        updatedAt: nowIso,
        createdAt: nowIso,
        __typename: 'DocumentRecord',
      },
    })
  );
  console.log(`Successfully saved dashboard snapshot for tenant: ${targetTenantId}`);
}

/**
 * High-performance dashboard data fetcher.
 * 1. Checks memory cache.
 * 2. Attempts single-item point lookup GetCommand on DynamoDB.
 * 3. Falls back to calculating metrics, writes snapshot back to DynamoDB, and caches in memory.
 */
export async function fetchDashboardData(options?: {
  forceRefresh?: boolean;
}): Promise<FinancialMetricData> {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  // 1. In-memory cache hit
  if (!forceRefresh && memoryCachedData && now - memoryCachedTimestamp < MEMORY_CACHE_TTL_MS) {
    return memoryCachedData;
  }

  // 2. Point lookup from DynamoDB snapshot record
  if (!forceRefresh && docTableName) {
    try {
      const snapshotId = `${SNAPSHOT_KEY_PREFIX}${tenantId}`;
      const res = await docClient.send(
        new GetCommand({
          TableName: docTableName,
          Key: { id: snapshotId },
        })
      );

      if (res.Item && res.Item.rawMetadata) {
        const metadata: FinancialMetricData =
          typeof res.Item.rawMetadata === 'string'
            ? JSON.parse(res.Item.rawMetadata)
            : res.Item.rawMetadata;

        const processedTimestamp = res.Item.processedAt
          ? new Date(res.Item.processedAt).getTime()
          : 0;

        // Valid if snapshot is younger than 5 minutes
        if (now - processedTimestamp < 5 * 60 * 1000) {
          memoryCachedData = metadata;
          memoryCachedTimestamp = now;
          return metadata;
        }
      }
    } catch (err) {
      console.warn('Could not read dashboard snapshot from DynamoDB, falling back to full calculation:', err);
    }
  }

  // 3. Fallback: Full deterministic calculation
  console.log(`Computing fresh dashboard metrics for tenant: ${tenantId}...`);
  const freshMetrics = await computeDashboardMetrics();

  // Persist newly computed snapshot back to DynamoDB asynchronously
  saveDashboardSnapshot(freshMetrics, tenantId).catch((err) => {
    console.error('Failed to persist dashboard snapshot to DynamoDB:', err);
  });

  // Update in-memory cache
  memoryCachedData = freshMetrics;
  memoryCachedTimestamp = now;

  return freshMetrics;
}

export async function computeDashboardMetrics(): Promise<FinancialMetricData> {
  // 1. Fetch raw canonical records from DynamoDB
  let documents: any[] = [];
  let transactions: any[] = [];
  let obligations: any[] = [];
  let cashSnapshots: any[] = [];
  let merchantSettingsList: any[] = [];
  let recurringExpenses: any[] = [];
  let suppliers: any[] = [];

  try {
    const docRes = await docClient.send(
      new ScanCommand({
        TableName: docTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    documents = docRes.Items || [];
  } catch (err) {
    console.error('Error fetching documents from DynamoDB:', err);
  }

  try {
    const txnRes = await docClient.send(
      new ScanCommand({
        TableName: txnTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    transactions = txnRes.Items || [];
  } catch (err) {
    console.error('Error fetching transactions from DynamoDB:', err);
  }

  try {
    const obRes = await docClient.send(
      new ScanCommand({
        TableName: obTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    obligations = obRes.Items || [];
  } catch (err) {
    console.error('Error fetching obligations from DynamoDB:', err);
  }

  // Fetch CashPositionSnapshot
  try {
    const cashRes = await docClient.send(
      new ScanCommand({
        TableName: cashPositionTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    cashSnapshots = cashRes.Items || [];
  } catch (err) {
    console.warn('Could not scan CashPositionSnapshot table:', err);
  }

  // Fetch MerchantFinancialSettings
  try {
    const settingsRes = await docClient.send(
      new ScanCommand({
        TableName: merchantSettingsTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    merchantSettingsList = settingsRes.Items || [];
  } catch (err) {
    console.warn('Could not scan MerchantFinancialSettings table:', err);
  }

  // Fetch RecurringExpense
  try {
    const recRes = await docClient.send(
      new ScanCommand({
        TableName: recurringExpenseTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    recurringExpenses = recRes.Items || [];
  } catch (err) {
    console.warn('Could not scan RecurringExpense table:', err);
  }

  // Fetch SupplierProfile
  try {
    const supRes = await docClient.send(
      new ScanCommand({
        TableName: supplierProfileTableName,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': tenantId },
      })
    );
    suppliers = supRes.Items || [];
  } catch (err) {
    console.warn('Could not scan SupplierProfile table:', err);
  }

  // 2. Base Balance calculation & As Of Date
  let totalBalance = 0;
  let asOfDate = new Date().toISOString().split('T')[0];
  let foundAuthoritativeBalance = false;

  // A. Priority 1: CashPositionSnapshot
  if (cashSnapshots.length > 0) {
    cashSnapshots.sort((a, b) => (b.asOf || '').localeCompare(a.asOf || ''));
    const latestCash = cashSnapshots[0];
    totalBalance = Number(latestCash.totalLiquidCash ?? latestCash.bankBalance ?? 0);
    if (latestCash.asOf) asOfDate = latestCash.asOf;
    foundAuthoritativeBalance = true;
  }

  // B. Priority 2: Transactions with balanceAfterTransaction
  if (!foundAuthoritativeBalance && transactions.length > 0) {
    const validBalances = transactions.filter((t) => t.balanceAfterTransaction != null && t.date);
    if (validBalances.length > 0) {
      validBalances.sort((a, b) => b.date.localeCompare(a.date));
      totalBalance = Number(validBalances[0].balanceAfterTransaction);
      asOfDate = validBalances[0].date;
      foundAuthoritativeBalance = true;
    }
  }

  // C. Priority 3: DocumentRecord rawMetadata
  if (!foundAuthoritativeBalance && documents.length > 0) {
    for (const doc of documents) {
      if (doc.rawMetadata) {
        try {
          const meta = typeof doc.rawMetadata === 'string' ? JSON.parse(doc.rawMetadata) : doc.rawMetadata;
          if (meta.closingBalance && typeof meta.closingBalance === 'number') {
            totalBalance = meta.closingBalance;
            if (meta.statementPeriod?.endDate) {
              asOfDate = meta.statementPeriod.endDate;
            }
            foundAuthoritativeBalance = true;
            break;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // Fallback if no ledger recorded yet: compute from inflows minus outflows
  if (!foundAuthoritativeBalance) {
    const sumInflow = transactions
      .filter((t) => t.type === 'INFLOW')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const sumOutflow = transactions
      .filter((t) => t.type === 'OUTFLOW')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    totalBalance = Math.max(0, sumInflow - sumOutflow);
  }

  // 3. Merchant Settings: Minimum Cash Buffer
  const merchantSettings = merchantSettingsList.length > 0 ? merchantSettingsList[0] : null;
  const minimumCashBuffer = Number(merchantSettings?.minimumCashBuffer ?? 20000);

  // 4. Statutory Lockbox and Spendable Liquidity
  const statutoryObligations = obligations.filter(
    (o) => o.isStatutory || o.category === 'GST_PAYMENT' || o.category === 'TDS_PAYMENT'
  );
  const gstAmount = statutoryObligations
    .filter((o) => o.title?.includes('GST') || o.category === 'GST_PAYMENT')
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const tdsAmount = statutoryObligations
    .filter((o) => o.title?.includes('TDS') || o.category === 'TDS_PAYMENT')
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const pfAmount = obligations
    .filter((o) => o.title?.includes('EPFO') || o.title?.includes('ESIC'))
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const statutoryTotal = gstAmount + tdsAmount + pfAmount;

  // Spendable liquidity preserves both statutory tax reserve AND minimum cash buffer
  const spendableLiquidity = Math.max(0, totalBalance - statutoryTotal - minimumCashBuffer);

  // 5. Burn Rate: Compute dynamically from Recurring Expenses
  let dynamicDailyBurn = 0;
  for (const exp of recurringExpenses) {
    if (exp.isActive === false) continue;
    const amt = Number(exp.amount) || 0;
    if (exp.frequency === 'DAILY') dynamicDailyBurn += amt;
    else if (exp.frequency === 'WEEKLY') dynamicDailyBurn += amt / 7;
    else if (exp.frequency === 'MONTHLY') dynamicDailyBurn += amt / 30;
    else if (exp.frequency === 'QUARTERLY') dynamicDailyBurn += amt / 90;
  }

  // If no recurring expenses configured, estimate baseline from fixed obligations or transaction outflows
  const fixedPayables = obligations.filter(
    (o) =>
      o.type === 'PAYABLE' &&
      (o.category === 'SALARY' ||
        o.category === 'OPERATING_EXPENSE' ||
        o.category === 'LOAN_EMI' ||
        o.category === 'UTILITY_BILL')
  );
  const fixedTotal = fixedPayables.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);

  const variablePayables = obligations.filter(
    (o) => o.type === 'PAYABLE' && (o.category === 'VENDOR_BILL' || o.category === 'OTHER')
  );
  const variableTotal = variablePayables.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);

  const netDailyBurn =
    dynamicDailyBurn > 0
      ? Math.round(dynamicDailyBurn)
      : fixedTotal > 0
      ? Math.round(fixedTotal / 30)
      : 3950;

  // 6. 15-day commitments & inflows
  const baseAsOf = new Date(asOfDate);
  const fifteenDaysDate = new Date(baseAsOf);
  fifteenDaysDate.setDate(fifteenDaysDate.getDate() + 15);
  const fifteenDaysOut = fifteenDaysDate.toISOString().slice(0, 10);

  const payablesNext15 = obligations
    .filter((o) => o.type === 'PAYABLE' && o.dueDate && o.dueDate <= fifteenDaysOut)
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);

  const receivablesNext15 = obligations
    .filter((o) => o.type === 'RECEIVABLE' && o.dueDate && o.dueDate <= fifteenDaysOut)
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);

  const commitmentsNext15Days = payablesNext15 > 0 ? payablesNext15 : 165000;
  const inflowsNext15Days = receivablesNext15 > 0 ? receivablesNext15 : 95000;
  const liquidityStressRatio = Number(
    ((totalBalance + inflowsNext15Days * 0.85) / commitmentsNext15Days).toFixed(2)
  );

  // 7. 60-Day Trajectory Simulation & Buffer Breach Analysis
  let runningBalance = totalBalance;
  let daysToZero = 60;
  let bufferBreachDay: number | null = null;
  let zeroBreached = false;
  let bufferBreached = false;

  const trajectory60Days: FinancialMetricData['trajectory60Days'] = [];

  for (let i = 1; i <= 60; i++) {
    const simDate = new Date(baseAsOf);
    simDate.setDate(baseAsOf.getDate() + i);
    const dateStr = simDate.toISOString().slice(0, 10);

    const dayOutflows = obligations
      .filter((o) => o.type === 'PAYABLE' && o.dueDate === dateStr)
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const dayInflows = obligations
      .filter((o) => o.type === 'RECEIVABLE' && o.dueDate === dateStr)
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const eventNames = obligations
      .filter((o) => o.dueDate === dateStr)
      .map((o) => `${o.title?.slice(0, 24)} (₹${Number(o.amount).toLocaleString('en-IN')})`);

    const dailyBaseExpenses = netDailyBurn;
    const totalOut = dayOutflows + (dayOutflows === 0 ? dailyBaseExpenses * 0.4 : 0);
    const regularDailyShopInflow = 4800;
    const totalIn = dayInflows + regularDailyShopInflow;

    const delta = totalIn - totalOut;
    runningBalance += delta;

    if (runningBalance < minimumCashBuffer && !bufferBreached) {
      bufferBreachDay = i;
      bufferBreached = true;
    }

    if (runningBalance < 0 && !zeroBreached) {
      daysToZero = i;
      zeroBreached = true;
    }

    trajectory60Days.push({
      day: i,
      date: dateStr,
      baseBalance: Math.round(runningBalance),
      optimisticBalance: Math.round(runningBalance + i * 1200),
      conservativeBalance: Math.round(runningBalance - i * 1800),
      netDelta: Math.round(delta),
      inflow: Math.round(totalIn),
      outflow: Math.round(totalOut),
      events: eventNames,
    });
  }

  // Solvency classification taking into account minimum cash buffer
  const solvencyStatus: FinancialMetricData['solvencyStatus'] =
    zeroBreached && daysToZero <= 14
      ? 'Critical'
      : bufferBreached && bufferBreachDay! <= 25
      ? 'Warning'
      : 'Safe';

  // 8. Pinch-Point Heatmap (Generated dynamically from obligations, supplemented by canon rules)
  const pinchPoints: FinancialMetricData['pinchPoints'] = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Identify high-outflow days from scheduled obligations
  const obligationsByDate: Record<string, any[]> = {};
  for (const obl of obligations) {
    if (obl.dueDate && obl.type === 'PAYABLE') {
      if (!obligationsByDate[obl.dueDate]) obligationsByDate[obl.dueDate] = [];
      obligationsByDate[obl.dueDate].push(obl);
    }
  }

  for (const [dateStr, dayObls] of Object.entries(obligationsByDate)) {
    const totalOut = dayObls.reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const dateObj = new Date(dateStr);
    const dayNum = Math.max(1, Math.round((dateObj.getTime() - baseAsOf.getTime()) / (1000 * 3600 * 24)));
    if (dayNum > 0 && dayNum <= 30) {
      const riskLevel = totalOut > 30000 || dayObls.some((o) => o.isStatutory) ? 'HIGH' : 'MEDIUM';
      pinchPoints.push({
        date: dateStr,
        dayNum,
        dayName: daysOfWeek[dateObj.getDay()] || 'Day',
        netDelta: -totalOut,
        riskLevel,
        title: dayObls.map((o) => o.title).join(' + ').slice(0, 45),
        amount: totalOut,
        category: dayObls[0].category || 'Bills',
        details: `Scheduled commitment of ₹${totalOut.toLocaleString('en-IN')}`,
      });
    }
  }

  // Fallback default pinch points if no obligations exist yet
  if (pinchPoints.length === 0) {
    pinchPoints.push(
      {
        date: '2026-10-07',
        dayNum: 7,
        dayName: 'Wed',
        netDelta: -14500,
        riskLevel: 'MEDIUM',
        title: 'TDS Tax Challan Due',
        amount: 14500,
        category: 'Taxes',
        details: 'Quarterly TDS payments for contractor services.',
      },
      {
        date: '2026-10-10',
        dayNum: 10,
        dayName: 'Sat',
        netDelta: -93000,
        riskLevel: 'HIGH',
        title: 'Monthly Staff Payroll + Shop Rent',
        amount: 93000,
        category: 'Payroll & Rent',
        details: 'Biggest single outflow of the month. ₹65k payroll + ₹28k rent.',
      },
      {
        date: '2026-10-15',
        dayNum: 15,
        dayName: 'Thu',
        netDelta: -18200,
        riskLevel: 'MEDIUM',
        title: 'EPFO & ESIC Deposit Deadline',
        amount: 18200,
        category: 'Statutory Compliance',
        details: 'Mandatory staff retirement fund deposit.',
      },
      {
        date: '2026-10-20',
        dayNum: 20,
        dayName: 'Tue',
        netDelta: -42000,
        riskLevel: 'HIGH',
        title: 'GST GSTR-3B Tax Filing Deadline',
        amount: 42000,
        category: 'Taxes',
        details: 'Statutory GST payment. 18% annual interest if missed!',
      }
    );
  }

  // 9. Debt Matrix (Aging vs Payable Urgency)
  const matrixDebts: FinancialMetricData['matrixDebts'] = [];
  if (obligations.length > 0) {
    for (const obl of obligations) {
      const dueDate = obl.dueDate ? new Date(obl.dueDate) : baseAsOf;
      const daysDue = Math.round((dueDate.getTime() - baseAsOf.getTime()) / (1000 * 3600 * 24));
      const isStatutory = obl.isStatutory || obl.category?.startsWith('GST') || obl.category?.startsWith('TDS');
      const penaltyRisk = isStatutory ? 'High' : obl.category === 'LOAN_EMI' ? 'High' : 'Zero';

      let urgencyScore = Math.round((obl.priorityWeight || 0.7) * 100);
      if (daysDue <= 0) urgencyScore = 98;
      else if (daysDue <= 3) urgencyScore = Math.max(urgencyScore, 90);
      else if (daysDue <= 7) urgencyScore = Math.max(urgencyScore, 80);

      let quadrant: 'IMMEDIATE_PAY' | 'FLEXIBLE_PAY' | 'URGENT_COLLECT' | 'SAFE_FLOAT' = 'IMMEDIATE_PAY';
      if (obl.type === 'RECEIVABLE') {
        quadrant = daysDue <= 0 || urgencyScore > 75 ? 'URGENT_COLLECT' : 'SAFE_FLOAT';
      } else {
        quadrant = daysDue <= 7 || isStatutory || urgencyScore >= 80 ? 'IMMEDIATE_PAY' : 'FLEXIBLE_PAY';
      }

      matrixDebts.push({
        id: obl.id,
        name: obl.title || obl.counterpartyName || 'Obligation',
        amount: Number(obl.amount || 0),
        type: obl.type === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE',
        daysDue,
        urgencyScore,
        penaltyRisk,
        quadrant,
        category: obl.category || 'General',
      });
    }
  }

  if (matrixDebts.length === 0) {
    matrixDebts.push(
      {
        id: 'm1',
        name: 'Store Staff Salaries',
        amount: 65000,
        type: 'PAYABLE',
        daysDue: 3,
        urgencyScore: 98,
        penaltyRisk: 'High',
        quadrant: 'IMMEDIATE_PAY',
        category: 'Salaries',
      },
      {
        id: 'm2',
        name: 'GST Return (GSTR-3B)',
        amount: 42000,
        type: 'PAYABLE',
        daysDue: 13,
        urgencyScore: 92,
        penaltyRisk: 'High',
        quadrant: 'IMMEDIATE_PAY',
        category: 'Taxes',
      },
      {
        id: 'm3',
        name: 'Shop & Godown Rent',
        amount: 28000,
        type: 'PAYABLE',
        daysDue: 3,
        urgencyScore: 88,
        penaltyRisk: 'Medium',
        quadrant: 'IMMEDIATE_PAY',
        category: 'Rent',
      },
      {
        id: 'm4',
        name: 'HDFC Machine Loan EMI',
        amount: 16400,
        type: 'PAYABLE',
        daysDue: 5,
        urgencyScore: 84,
        penaltyRisk: 'High',
        quadrant: 'IMMEDIATE_PAY',
        category: 'Loan EMI',
      }
    );
  }

  // 10. Debtors Reliability
  const debtorsReliability: FinancialMetricData['debtorsReliability'] = [
    {
      name: 'City Fashion Hub',
      amountDue: 55000,
      agreedDue: '2026-10-19',
      expectedRealisticDate: '2026-10-31',
      averageDelayDays: 12,
      concentrationPercentage: 38,
      reliabilityScore: 62,
    },
    {
      name: 'Apex Retail Mart',
      amountDue: 40000,
      agreedDue: '2026-10-14',
      expectedRealisticDate: '2026-10-18',
      averageDelayDays: 4,
      concentrationPercentage: 28,
      reliabilityScore: 86,
    },
    {
      name: 'Balaji Supermarket',
      amountDue: 28000,
      agreedDue: '2026-10-25',
      expectedRealisticDate: '2026-10-27',
      averageDelayDays: 2,
      concentrationPercentage: 19,
      reliabilityScore: 94,
    },
    {
      name: 'Royal Traders',
      amountDue: 22000,
      agreedDue: '2026-09-28',
      expectedRealisticDate: 'Delayed / Follow-up',
      averageDelayDays: 19,
      concentrationPercentage: 15,
      reliabilityScore: 44,
    },
  ];

  // 11. Working Capital Cycle (CCC)
  const workingCapitalCycle = {
    dso: 26,
    dio: 42,
    dpo: 33,
    ccc: 26 + 42 - 33,
  };

  const expectedMonthlyRevenue = 240000;
  const fixedPercentageOfExpectedInflow = Math.round((fixedTotal / expectedMonthlyRevenue) * 100);

  // 12. Payment Rail Cost Tracker
  const paymentRailSavings: FinancialMetricData['paymentRailSavings'] = {
    monthlyVolume: 480000,
    currentEstimatedFees: 2450,
    optimizedFees: 380,
    monthlySavings: 2070,
    recommendations: [
      {
        vendor: 'Aggarwal Wholesale (Raw Material)',
        amount: 48000,
        bestRail: 'NEFT (Bank Transfer)',
        avoidRail: 'Credit Card / Gateway (1.8% Fee)',
        savings: 864,
      },
      {
        vendor: 'Sharma Textiles Fabrics',
        amount: 35000,
        bestRail: 'Direct Bank NEFT / NetBanking',
        avoidRail: 'Commercial Card',
        savings: 630,
      },
      {
        vendor: 'Store Walk-in Customers',
        amount: 145000,
        bestRail: 'BHIM / RuPay UPI QR (0% MDR)',
        avoidRail: 'Private POS Card Swipes',
        savings: 1450,
      },
    ],
  };

  // 13. Discount Arbitrage & Payables Optimization
  const discountArbitrage: FinancialMetricData['discountArbitrage'] = [
    {
      supplierName: 'Aggarwal Wholesale',
      billAmount: 48000,
      discountPercent: 2,
      discountExpiryDays: 5,
      instantSavings: 960,
      annualizedReturn: 36.5,
      canAffordNow: totalBalance > 70000,
      recommendation:
        'Pay within 5 days to pocket ₹960 instant cash discount (equivalent to 36.5% yearly return on capital).',
    },
    {
      supplierName: 'TReDS Bill Discounting Option',
      billAmount: 55000,
      discountPercent: 1.2,
      discountExpiryDays: 14,
      instantSavings: -660,
      annualizedReturn: 13.8,
      canAffordNow: true,
      recommendation:
        'Discount City Fashion invoice on TReDS at 13.8% p.a. to receive ₹54,340 cash immediately instead of waiting 24 days.',
    },
  ];

  // 14. Statutory Compliance Radar
  const statutoryCompliance: FinancialMetricData['statutoryCompliance'] = [
    {
      taxName: 'GST Monthly Return',
      form: 'GSTR-3B',
      dueDate: '2026-10-20',
      daysLeft: 13,
      amountDue: gstAmount > 0 ? gstAmount : 42000,
      status: 'Upcoming',
      penaltyIfMissedDaily: '₹50/day late fee + 18% annual interest',
    },
    {
      taxName: 'TDS Challan Payment',
      form: 'Challan 281',
      dueDate: '2026-10-07',
      daysLeft: 0,
      amountDue: tdsAmount > 0 ? tdsAmount : 14500,
      status: 'Urgent',
      penaltyIfMissedDaily: '1.5% interest per month from deduction date',
    },
    {
      taxName: 'EPFO & ESIC Deposit',
      form: 'ECR Challan',
      dueDate: '2026-10-15',
      daysLeft: 8,
      amountDue: pfAmount > 0 ? pfAmount : 18200,
      status: 'Upcoming',
      penaltyIfMissedDaily: 'Up to 25% damages + 12% interest',
    },
    {
      taxName: 'Advance Tax Q3 Installment',
      form: 'Challan 280',
      dueDate: '2026-12-15',
      daysLeft: 69,
      amountDue: 35000,
      status: 'Upcoming',
      penaltyIfMissedDaily: '1% per month interest under Section 234C',
    },
  ];

  return {
    asOfDate,
    totalLiquidBalance: totalBalance,
    spendableLiquidity,
    minimumCashBuffer,
    bufferBreachDay,
    statutoryLockbox: statutoryTotal,
    statutoryBreakdown: {
      gst: gstAmount,
      tds: tdsAmount,
      pfEsic: pfAmount,
      advanceTax: 0,
    },
    netDailyBurn,
    daysToZero,
    solvencyStatus,
    liquidityStressRatio,
    inflowsNext15Days,
    commitmentsNext15Days,
    fixedObligationsTotal: fixedTotal,
    variableObligationsTotal: variableTotal,
    fixedPercentageOfExpectedInflow,
    workingCapitalCycle,
    trajectory60Days,
    pinchPoints,
    matrixDebts,
    debtorsReliability,
    paymentRailSavings,
    discountArbitrage,
    statutoryCompliance,
  };
}
