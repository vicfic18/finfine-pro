import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';
const docTableName = process.env.DOCUMENT_RECORD_TABLE_NAME || 'DocumentRecord-ifsueqzwybf6nau7duulv5qweq-NONE';
const txnTableName = process.env.TRANSACTION_TABLE_NAME || 'Transaction-ifsueqzwybf6nau7duulv5qweq-NONE';
const obTableName = process.env.OBLIGATION_TABLE_NAME || 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Snapshot & Memory Cache Configuration
export const SNAPSHOT_KEY_PREFIX = 'snapshot#';
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 60 seconds
let memoryCachedData: FinancialMetricData | null = null;
let memoryCachedTimestamp = 0;

export interface FinancialMetricData {
  asOfDate: string;
  totalLiquidBalance: number;
  spendableLiquidity: number;
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
 * 1. Checks memory cache (0ms).
 * 2. Attempts single-item point lookup GetCommand on DynamoDB (~5ms, 0.5 RCU).
 * 3. Falls back to calculating metrics, writes snapshot back to DynamoDB, and caches in memory.
 */
export async function fetchDashboardData(options?: {
  forceRefresh?: boolean;
}): Promise<FinancialMetricData> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  // 1. Memory Cache check
  if (!forceRefresh && memoryCachedData && now - memoryCachedTimestamp < MEMORY_CACHE_TTL_MS) {
    return memoryCachedData;
  }

  // 2. DynamoDB Snapshot point-lookup (GetCommand by primary key id)
  if (!forceRefresh) {
    try {
      const snapshotId = `${SNAPSHOT_KEY_PREFIX}${tenantId}`;
      const snapshotRes = await docClient.send(
        new GetCommand({
          TableName: docTableName,
          Key: { id: snapshotId },
        })
      );

      if (snapshotRes.Item && snapshotRes.Item.rawMetadata) {
        const metadata =
          typeof snapshotRes.Item.rawMetadata === 'string'
            ? JSON.parse(snapshotRes.Item.rawMetadata)
            : snapshotRes.Item.rawMetadata;

        if (
          metadata &&
          metadata.asOfDate &&
          Array.isArray(metadata.trajectory60Days) &&
          metadata.trajectory60Days.length > 0 &&
          Array.isArray(metadata.pinchPoints) &&
          metadata.paymentRailSavings
        ) {
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
  // 1. Fetch raw documents, transactions, and obligations from DynamoDB
  let documents: any[] = [];
  let transactions: any[] = [];
  let obligations: any[] = [];

  try {
    const docRes = await docClient.send(new ScanCommand({
      TableName: docTableName,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    }));
    documents = docRes.Items || [];
  } catch (err) {
    console.error('Error fetching documents from DynamoDB:', err);
  }

  try {
    const txnRes = await docClient.send(new ScanCommand({
      TableName: txnTableName,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    }));
    transactions = txnRes.Items || [];
  } catch (err) {
    console.error('Error fetching transactions from DynamoDB:', err);
  }

  try {
    const obRes = await docClient.send(new ScanCommand({
      TableName: obTableName,
      FilterExpression: 'tenantId = :tid',
      ExpressionAttributeValues: { ':tid': tenantId },
    }));
    obligations = obRes.Items || [];
  } catch (err) {
    console.error('Error fetching obligations from DynamoDB:', err);
  }

  // 2. Base Balance calculation
  let totalBalance = 82350; // default anchor from HDFC statement
  let asOfDate = '2026-10-07';

  // Check document metadata
  if (documents.length > 0) {
    for (const doc of documents) {
      if (doc.rawMetadata) {
        try {
          const meta = typeof doc.rawMetadata === 'string' ? JSON.parse(doc.rawMetadata) : doc.rawMetadata;
          if (meta.closingBalance && typeof meta.closingBalance === 'number') {
            totalBalance = meta.closingBalance;
            if (meta.statementPeriod?.endDate) {
              asOfDate = meta.statementPeriod.endDate;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // If latest transaction has balanceAfterTransaction
  if (transactions.length > 0) {
    const validBalances = transactions.filter(t => t.balanceAfterTransaction != null && t.date);
    if (validBalances.length > 0) {
      validBalances.sort((a, b) => b.date.localeCompare(a.date));
      totalBalance = Number(validBalances[0].balanceAfterTransaction);
      asOfDate = validBalances[0].date;
    }
  }

  // 3. Obligations analysis
  const statutoryObligations = obligations.filter(o => o.isStatutory || o.category === 'GST_PAYMENT' || o.category === 'TDS_PAYMENT');
  const gstAmount = statutoryObligations.filter(o => o.title?.includes('GST') || o.category === 'GST_PAYMENT').reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const tdsAmount = statutoryObligations.filter(o => o.title?.includes('TDS') || o.category === 'TDS_PAYMENT').reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const pfAmount = obligations.filter(o => o.title?.includes('EPFO') || o.title?.includes('ESIC')).reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const statutoryTotal = gstAmount + tdsAmount + pfAmount;

  const spendableLiquidity = Math.max(0, totalBalance - statutoryTotal);

  // 4. Burn Rate calculation
  // Preceding window daily burn: rent + utilities + payroll + baseline operating expenses
  const fixedPayables = obligations.filter(o => o.type === 'PAYABLE' && (o.category === 'SALARY' || o.category === 'OPERATING_EXPENSE' || o.category === 'LOAN_EMI' || o.category === 'UTILITY_BILL'));
  const fixedTotal = fixedPayables.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
  
  const variablePayables = obligations.filter(o => o.type === 'PAYABLE' && (o.category === 'VENDOR_BILL' || o.category === 'OTHER'));
  const variableTotal = variablePayables.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);

  // Approximate daily operational baseline (monthly fixed overheads ~ ₹118k / 30 = ₹3,940/day)
  const netDailyBurn = 3950;

  // 5. 15-day commitments & inflows
  const fifteenDaysOut = '2026-10-22';
  const payablesNext15 = obligations
    .filter(o => o.type === 'PAYABLE' && o.dueDate && o.dueDate <= fifteenDaysOut)
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);

  const receivablesNext15 = obligations
    .filter(o => o.type === 'RECEIVABLE' && o.dueDate && o.dueDate <= fifteenDaysOut)
    .reduce((sum, o) => sum + Number(o.amount || 0), 0);

  // Coverage Index (Stress Ratio) = (Guaranteed Cash Inflow + Current Balance) / Fixed Commitments maturing in 15 days
  const commitmentsNext15Days = payablesNext15 > 0 ? payablesNext15 : 165000;
  const inflowsNext15Days = receivablesNext15 > 0 ? receivablesNext15 : 95000;
  const liquidityStressRatio = Number(((totalBalance + (inflowsNext15Days * 0.85)) / commitmentsNext15Days).toFixed(2));

  // 6. Solvency Countdown (Days to Zero)
  // Compute day by day until balance dips below zero
  let runningBalance = totalBalance;
  let daysToZero = 60; // default cap
  let breached = false;

  // Map dates for 60 days starting 2026-10-08
  const trajectory60Days: FinancialMetricData['trajectory60Days'] = [];
  const baseStartDate = new Date(2026, 9, 7); // Oct 7, 2026

  for (let i = 1; i <= 60; i++) {
    const simDate = new Date(baseStartDate);
    simDate.setDate(baseStartDate.getDate() + i);
    const dateStr = simDate.toISOString().slice(0, 10);

    // Find obligations scheduled on this date
    const dayOutflows = obligations
      .filter(o => o.type === 'PAYABLE' && o.dueDate === dateStr)
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const dayInflows = obligations
      .filter(o => o.type === 'RECEIVABLE' && o.dueDate === dateStr)
      .reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const eventNames = obligations
      .filter(o => o.dueDate === dateStr)
      .map(o => `${o.title?.slice(0, 24)} (₹${Number(o.amount).toLocaleString('en-IN')})`);

    // Baseline daily run-rate burn
    const dailyBaseExpenses = netDailyBurn;
    const totalOut = dayOutflows + (dayOutflows === 0 ? dailyBaseExpenses * 0.4 : 0);
    // Estimated daily retail walk-in UPI sales
    const regularDailyShopInflow = 4800;
    const totalIn = dayInflows + regularDailyShopInflow;

    const delta = totalIn - totalOut;
    runningBalance += delta;

    if (runningBalance < 0 && !breached) {
      daysToZero = i;
      breached = true;
    }

    trajectory60Days.push({
      day: i,
      date: dateStr,
      baseBalance: Math.round(runningBalance),
      optimisticBalance: Math.round(runningBalance + (i * 1200)),
      conservativeBalance: Math.round(runningBalance - (i * 1800)),
      netDelta: Math.round(delta),
      inflow: Math.round(totalIn),
      outflow: Math.round(totalOut),
      events: eventNames,
    });
  }

  // Solvency classification
  const solvencyStatus = daysToZero > 30 ? 'Safe' : daysToZero >= 14 ? 'Warning' : 'Critical';

  // 7. Pinch-Point Heatmap
  const pinchPoints: FinancialMetricData['pinchPoints'] = [
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
      date: '2026-10-12',
      dayNum: 12,
      dayName: 'Mon',
      netDelta: -16400,
      riskLevel: 'MEDIUM',
      title: 'HDFC Business Equipment EMI',
      amount: 16400,
      category: 'Loan EMI',
      details: 'Auto-debit from current account. Maintain minimum balance.',
    },
    {
      date: '2026-10-14',
      dayNum: 14,
      dayName: 'Wed',
      netDelta: 40000,
      riskLevel: 'LOW',
      title: 'Apex Retail Mart Consignment Inflow',
      amount: 40000,
      category: 'Customer Receipt',
      details: 'Customer wholesale clearance expected.',
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
      date: '2026-10-16',
      dayNum: 16,
      dayName: 'Fri',
      netDelta: -35000,
      riskLevel: 'HIGH',
      title: 'Sharma Textiles Stock Invoice #8821',
      amount: 35000,
      category: 'Supplier Bill',
      details: 'Key supplier payable. Candidate for recommended 6-day deferral.',
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
    },
    {
      date: '2026-10-22',
      dayNum: 22,
      dayName: 'Thu',
      netDelta: -48000,
      riskLevel: 'MEDIUM',
      title: 'Aggarwal Wholesale (2% Discount Available)',
      amount: 48000,
      category: 'Supplier Bill',
      details: 'Can save ₹960 if paid early before Oct 12.',
    }
  ];

  // 8. Debt Matrix (Aging vs Payable Urgency)
  const matrixDebts: FinancialMetricData['matrixDebts'] = [
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
    },
    {
      id: 'm5',
      name: 'Sharma Textiles',
      amount: 35000,
      type: 'PAYABLE',
      daysDue: 9,
      urgencyScore: 35,
      penaltyRisk: 'Zero',
      quadrant: 'FLEXIBLE_PAY',
      category: 'Suppliers',
    },
    {
      id: 'm6',
      name: 'National Packaging Corp',
      amount: 12500,
      type: 'PAYABLE',
      daysDue: 21,
      urgencyScore: 25,
      penaltyRisk: 'Zero',
      quadrant: 'FLEXIBLE_PAY',
      category: 'Suppliers',
    },
    {
      id: 'm7',
      name: 'Royal Traders (Overdue Invoice)',
      amount: 22000,
      type: 'RECEIVABLE',
      daysDue: -9, // 9 days overdue!
      urgencyScore: 95,
      penaltyRisk: 'High',
      quadrant: 'URGENT_COLLECT',
      category: 'Pending Customers',
    },
    {
      id: 'm8',
      name: 'City Fashion Hub',
      amount: 55000,
      type: 'RECEIVABLE',
      daysDue: 12,
      urgencyScore: 78,
      penaltyRisk: 'Medium',
      quadrant: 'URGENT_COLLECT',
      category: 'Pending Customers',
    },
    {
      id: 'm9',
      name: 'Apex Retail Mart',
      amount: 40000,
      type: 'RECEIVABLE',
      daysDue: 7,
      urgencyScore: 40,
      penaltyRisk: 'Zero',
      quadrant: 'SAFE_FLOAT',
      category: 'Reliable Inflow',
    },
    {
      id: 'm10',
      name: 'Balaji Supermarket',
      amount: 28000,
      type: 'RECEIVABLE',
      daysDue: 18,
      urgencyScore: 30,
      penaltyRisk: 'Zero',
      quadrant: 'SAFE_FLOAT',
      category: 'Reliable Inflow',
    }
  ];

  // 9. Debtor Reliability
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
    }
  ];

  // 10. Working Capital Cycle (CCC)
  // DSO = 26 days, DIO = 42 days, DPO = 33 days => CCC = 35 days
  const workingCapitalCycle = {
    dso: 26,
    dio: 42,
    dpo: 33,
    ccc: 26 + 42 - 33, // 35 days
  };

  // Expected Monthly Revenue ~ ₹2,40,000
  const expectedMonthlyRevenue = 240000;
  const fixedPercentageOfExpectedInflow = Math.round((fixedTotal / expectedMonthlyRevenue) * 100);

  // 11. Payment Rail Cost Tracker
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
      }
    ]
  };

  // 12. Working Capital Financing & Discount Arbitrage
  const discountArbitrage: FinancialMetricData['discountArbitrage'] = [
    {
      supplierName: 'Aggarwal Wholesale',
      billAmount: 48000,
      discountPercent: 2,
      discountExpiryDays: 5,
      instantSavings: 960,
      annualizedReturn: 36.5,
      canAffordNow: totalBalance > 70000,
      recommendation: 'Pay within 5 days to pocket ₹960 instant cash discount (equivalent to 36.5% yearly return on capital).',
    },
    {
      supplierName: 'TReDS Bill Discounting Option',
      billAmount: 55000,
      discountPercent: 1.2,
      discountExpiryDays: 14,
      instantSavings: -660,
      annualizedReturn: 13.8,
      canAffordNow: true,
      recommendation: 'Discount City Fashion invoice on TReDS at 13.8% p.a. to receive ₹54,340 cash immediately instead of waiting 24 days.',
    }
  ];

  // 13. Statutory Compliance Radar
  const statutoryCompliance: FinancialMetricData['statutoryCompliance'] = [
    {
      taxName: 'GST Monthly Return',
      form: 'GSTR-3B',
      dueDate: '2026-10-20',
      daysLeft: 13,
      amountDue: 42000,
      status: 'Upcoming',
      penaltyIfMissedDaily: '₹50/day late fee + 18% annual interest',
    },
    {
      taxName: 'TDS Challan Payment',
      form: 'Challan 281',
      dueDate: '2026-10-07',
      daysLeft: 0,
      amountDue: 14500,
      status: 'Urgent',
      penaltyIfMissedDaily: '1.5% interest per month from deduction date',
    },
    {
      taxName: 'EPFO & ESIC Deposit',
      form: 'ECR Challan',
      dueDate: '2026-10-15',
      daysLeft: 8,
      amountDue: 18200,
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
    }
  ];

  return {
    asOfDate,
    totalLiquidBalance: totalBalance,
    spendableLiquidity,
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
