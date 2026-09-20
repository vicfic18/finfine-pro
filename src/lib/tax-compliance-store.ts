/**
 * Tax Compliance Store & Database Synchronization Engine
 * 
 * Handles reading and writing:
 * - Dynamic Tax Compliance Rules from DynamoDB
 * - Indian Market Calendar Events from DynamoDB
 * - Merchant Tax Classification Profiles
 * - Automated synchronization of selected statutory rules into the real Obligation ledger
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  TaxComplianceRule,
  MarketCalendarEvent,
  MerchantTaxProfile,
  AUTHORITATIVE_TAX_RULES_CATALOG,
  AUTHORITATIVE_MARKET_EVENTS_CATALOG,
  calculateNextDueDate,
  matchApplicableTaxRules,
} from './tax-rules-engine';
import { invalidateDashboardCache } from './financial-store';

const region = process.env.AWS_REGION || 'ap-south-1';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';

const taxRuleTable = process.env.TAX_COMPLIANCE_RULE_TABLE_NAME || 'TaxComplianceRule-ifsueqzwybf6nau7duulv5qweq-NONE';
const marketEventTable = process.env.MARKET_CALENDAR_EVENT_TABLE_NAME || 'MarketCalendarEvent-ifsueqzwybf6nau7duulv5qweq-NONE';
const merchantSettingsTable = process.env.MERCHANT_SETTINGS_TABLE_NAME || 'MerchantFinancialSettings-ifsueqzwybf6nau7duulv5qweq-NONE';
const obligationTable = process.env.OBLIGATION_TABLE_NAME || 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// In-memory cache with 30s TTL
let cachedRules: TaxComplianceRule[] | null = null;
let cachedRulesTimestamp = 0;
let cachedEvents: MarketCalendarEvent[] | null = null;
let cachedEventsTimestamp = 0;
const CACHE_TTL_MS = 30000;

/**
 * Fetch all statutory tax compliance rules from DynamoDB
 */
export async function getTaxComplianceRules(forceRefresh = false): Promise<TaxComplianceRule[]> {
  const now = Date.now();
  if (!forceRefresh && cachedRules && now - cachedRulesTimestamp < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const res = await docClient.send(
      new ScanCommand({
        TableName: taxRuleTable,
      })
    );

    if (res.Items && res.Items.length > 0) {
      cachedRules = res.Items as TaxComplianceRule[];
      cachedRulesTimestamp = now;
      return cachedRules;
    }
  } catch (err) {
    console.warn('Could not scan TaxComplianceRule table from DynamoDB, using authoritative catalog fallback:', err);
  }

  return AUTHORITATIVE_TAX_RULES_CATALOG;
}

/**
 * Fetch Indian festive & market calendar events from DynamoDB
 */
export async function getMarketCalendarEvents(forceRefresh = false): Promise<MarketCalendarEvent[]> {
  const now = Date.now();
  if (!forceRefresh && cachedEvents && now - cachedEventsTimestamp < CACHE_TTL_MS) {
    return cachedEvents;
  }

  try {
    const res = await docClient.send(
      new ScanCommand({
        TableName: marketEventTable,
      })
    );

    if (res.Items && res.Items.length > 0) {
      cachedEvents = res.Items as MarketCalendarEvent[];
      cachedEventsTimestamp = now;
      return cachedEvents;
    }
  } catch (err) {
    console.warn('Could not scan MarketCalendarEvent table from DynamoDB, using authoritative catalog fallback:', err);
  }

  return AUTHORITATIVE_MARKET_EVENTS_CATALOG;
}

/**
 * Fetch Merchant Tax Profile from DynamoDB settings
 */
export async function getMerchantTaxProfile(targetTenantId = tenantId): Promise<MerchantTaxProfile> {
  try {
    const res = await docClient.send(
      new ScanCommand({
        TableName: merchantSettingsTable,
        FilterExpression: 'tenantId = :tid',
        ExpressionAttributeValues: { ':tid': targetTenantId },
      })
    );

    if (res.Items && res.Items.length > 0) {
      const item = res.Items[0];
      if (item.taxProfile) {
        return {
          tenantId: targetTenantId,
          ...item.taxProfile,
        };
      }

      // Infer profile from merchant settings
      const inferredTurnover = 5000000;
      return {
        tenantId: targetTenantId,
        entityType: (item.businessType as any) || 'SOLE_PROPRIETORSHIP',
        turnoverBracket: '40L_1_5CR',
        annualTurnover: inferredTurnover,
        gstScheme: item.gstin ? 'REGULAR_MONTHLY' : 'REGULAR_MONTHLY',
        employeeCount: 8,
        state: 'Maharashtra',
        pan: item.pan || '',
        gstin: item.gstin || '',
        tan: item.tan || '',
        cin: item.cin || '',
        selectedRuleCodes: ['GST_GSTR3B', 'GST_GSTR1', 'TDS_DEPOSIT_MONTHLY', 'ADVANCE_TAX_Q2'],
        customRuleAmounts: {},
        acknowledgedWarnings: [],
      };
    }
  } catch (err) {
    console.warn('Could not load merchant tax profile from DynamoDB:', err);
  }

  // Authoritative default
  return {
    tenantId: targetTenantId,
    entityType: 'SOLE_PROPRIETORSHIP',
    turnoverBracket: '40L_1_5CR',
    annualTurnover: 5000000,
    gstScheme: 'REGULAR_MONTHLY',
    employeeCount: 8,
    state: 'Maharashtra',
    selectedRuleCodes: ['GST_GSTR3B', 'GST_GSTR1', 'TDS_DEPOSIT_MONTHLY', 'ADVANCE_TAX_Q2'],
    customRuleAmounts: {},
    acknowledgedWarnings: [],
  };
}

/**
 * Save Merchant Tax Profile to DynamoDB and sync obligations ledger
 */
export async function saveMerchantTaxProfile(
  profile: Partial<MerchantTaxProfile>,
  targetTenantId = tenantId
): Promise<MerchantTaxProfile> {
  const current = await getMerchantTaxProfile(targetTenantId);
  const updated: MerchantTaxProfile = {
    ...current,
    ...profile,
    tenantId: targetTenantId,
    updatedAt: new Date().toISOString(),
  };

  try {
    // 1. Persist inside MerchantFinancialSettings
    const id = `settings-${targetTenantId}`;
    await docClient.send(
      new PutCommand({
        TableName: merchantSettingsTable,
        Item: {
          id,
          tenantId: targetTenantId,
          taxProfile: updated,
          updatedAt: new Date().toISOString(),
        },
      })
    );

    // 2. Synchronize selected tax obligations into canonical Obligation table
    await syncTaxObligationsToDatabase(targetTenantId, updated);
  } catch (err) {
    console.warn('Failed to persist MerchantTaxProfile to DynamoDB:', err);
  }

  invalidateDashboardCache();
  return updated;
}

/**
 * Synchronize selected tax compliance rules into real scheduled obligations in DynamoDB
 */
export async function syncTaxObligationsToDatabase(
  targetTenantId = tenantId,
  profile: MerchantTaxProfile
): Promise<number> {
  const catalog = await getTaxComplianceRules();
  const matchedRules = matchApplicableTaxRules(profile, catalog);

  // Filter only user-selected matched rules
  const selectedRules = matchedRules.filter((m) =>
    profile.selectedRuleCodes.includes(m.rule.ruleCode)
  );

  let syncedCount = 0;
  const now = new Date();
  const asOfDateStr = now.toISOString().slice(0, 10);

  // 1. Fetch existing statutory obligations generated by tax profile sync
  let existingStatutoryObligations: any[] = [];
  try {
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: obligationTable,
        FilterExpression: 'tenantId = :tid AND begins_with(documentId, :prefix)',
        ExpressionAttributeValues: {
          ':tid': targetTenantId,
          ':prefix': 'tax-profile-sync-',
        },
      })
    );
    existingStatutoryObligations = scanRes.Items || [];
  } catch (err) {
    console.warn('Could not scan existing tax sync obligations:', err);
  }

  // Delete previously synced obligations that are no longer selected
  const activeDocIds = new Set(selectedRules.map((m) => `tax-profile-sync-${m.rule.ruleCode}`));
  for (const existing of existingStatutoryObligations) {
    if (!activeDocIds.has(existing.documentId)) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: obligationTable,
            Key: { id: existing.id },
          })
        );
      } catch (delErr) {
        console.warn(`Could not delete stale obligation ${existing.id}:`, delErr);
      }
    }
  }

  // 2. Upsert real scheduled obligations for the selected statutory rules
  for (const match of selectedRules) {
    const rule = match.rule;
    const amount = match.estimatedAmount;
    if (amount <= 0) continue; // Skip zero payment declarations (like GSTR-1 or DIR-3)

    const docId = `tax-profile-sync-${rule.ruleCode}`;
    const oblId = `statutory-${rule.ruleCode.toLowerCase().replace(/_/g, '-')}`;

    const dueDate = calculateNextDueDate(rule, now);

    // Compute statutory daily penalty estimate
    const penaltyPerDay = rule.category === 'GST' ? 50 : rule.category === 'TDS' ? 100 : 75;

    const obligationItem = {
      id: oblId,
      tenantId: targetTenantId,
      documentId: docId,
      title: rule.title,
      counterpartyName: rule.taxAuthority,
      statutoryId: profile.gstin || profile.pan || 'IN-STATUTORY',
      amount,
      dueDate,
      type: 'PAYABLE',
      category: rule.category === 'GST' ? 'GST_PAYMENT' : rule.category === 'TDS' ? 'TDS_PAYMENT' : 'STATUTORY_TAX',
      priorityWeight: 1.0, // Maximum deterministic solvency priority
      penaltyRatePerDay: penaltyPerDay,
      isStatutory: true,
      status: 'SCHEDULED',
      allowPartialPayment: false,
      updatedAt: new Date().toISOString(),
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: obligationTable,
          Item: obligationItem,
        })
      );
      syncedCount++;
    } catch (putErr) {
      console.warn(`Failed to put statutory obligation for rule ${rule.ruleCode}:`, putErr);
    }
  }

  console.log(`✓ Synchronized ${syncedCount} statutory obligations into DynamoDB ledger for tenant ${targetTenantId}`);
  return syncedCount;
}
