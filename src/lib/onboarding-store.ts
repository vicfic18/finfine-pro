/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { requirePrincipal } from '@/lib/server-auth';
import { documentExtractionView } from '@/lib/document-presentation';
import outputs from '../../amplify_outputs.json';

export type OnboardingStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';
export type OnboardingRecord = {
  id: string;
  status: OnboardingStatus;
  currentStep: number;
  profile: Record<string, unknown>;
  financialSettings: Record<string, unknown>;
  applicableCategories: string[];
  coverage: Record<string, unknown>;
  attestations: Record<string, unknown>;
  confirmations: Record<string, unknown>;
  readiness?: Readiness;
  completedAt?: string;
};

export type Readiness = {
  ready: boolean;
  score: number;
  requiredCategories: string[];
  satisfiedCategories: string[];
  coverage: Record<string, { complete: boolean; label: string; detail?: string }>;
  warnings: string[];
  blockers: string[];
};

export type SafeDocument = {
  id: string;
  fileName: string;
  purpose: string;
  category: string;
  detectedCategories: string[];
  status: string;
  validationStatus: string;
  validationIssues: string[];
  reportingStartDate?: string;
  reportingEndDate?: string;
  reportingPeriod?: Record<string, unknown> | null;
  extractedEntityCount?: number;
  extractedFields?: Record<string, unknown>;
  extractionSummary?: Record<string, number>;
  extractedData?: ReturnType<typeof documentExtractionView>['extractedData'];
  processedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

const region = process.env.AWS_REGION || (outputs as { auth?: { aws_region?: string } }).auth?.aws_region || 'ap-south-1';
const custom = (outputs as unknown as { custom?: Record<string, string> }).custom || {};
const table = (env: string, output: string, fallback: string) => process.env[env] || custom[output] || fallback;
const names = {
  onboarding: table('MERCHANT_ONBOARDING_TABLE_NAME', 'merchantOnboardingTableName', 'MerchantOnboarding'),
  documents: table('DOCUMENT_RECORD_TABLE_NAME', 'documentRecordTableName', 'DocumentRecord'),
  settings: table('MERCHANT_SETTINGS_TABLE_NAME', 'merchantSettingsTableName', 'MerchantFinancialSettings'),
  cash: table('CASH_POSITION_TABLE_NAME', 'cashPositionTableName', 'CashPositionSnapshot'),
};

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

let testGateOverride: ((requestOrTenantId: Request | string) => Promise<string>) | undefined;

export function setOnboardingGateOverrideForTests(
  override?: (requestOrTenantId: Request | string) => Promise<string>,
): void {
  if (process.env.FINFINE_ENABLE_TEST_OVERRIDES !== '1') throw new Error('The onboarding gate override is test-only.');
  testGateOverride = override;
}

const defaults = (id: string): OnboardingRecord => ({
  id,
  status: 'DRAFT',
  currentStep: 1,
  profile: {},
  financialSettings: {},
  applicableCategories: ['BANK_ACTIVITY', 'PRODUCT_SALES', 'INVENTORY', 'PURCHASES', 'OBLIGATIONS', 'RECURRING_EXPENSES'],
  coverage: {},
  attestations: {},
  confirmations: {},
});

function publicRecord(item: Record<string, any> | undefined, tenantId: string): OnboardingRecord {
  const source = item || {};
  const safeSource = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== 'tenantId' && key !== 'updatedAt'),
  );
  return {
    ...defaults(`onboarding-${tenantId}`),
    ...safeSource,
    id: `onboarding-${tenantId}`,
    status: source.status === 'COMPLETED' ? 'COMPLETED' : source.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'DRAFT',
    currentStep: Math.min(9, Math.max(1, Number(source.currentStep || 1))),
    profile: source.profile && typeof source.profile === 'object' ? source.profile : {},
    financialSettings: source.financialSettings && typeof source.financialSettings === 'object' ? source.financialSettings : {},
    applicableCategories: Array.isArray(source.applicableCategories) ? source.applicableCategories : defaults(tenantId).applicableCategories,
    coverage: source.coverage && typeof source.coverage === 'object' ? source.coverage : {},
    attestations: source.attestations && typeof source.attestations === 'object' ? source.attestations : {},
    confirmations: source.confirmations && typeof source.confirmations === 'object' ? source.confirmations : {},
  };
}

export async function getOnboarding(tenantId: string): Promise<OnboardingRecord> {
  const result = await client.send(new GetCommand({ TableName: names.onboarding, Key: { id: `onboarding-${tenantId}` }, ConsistentRead: true }));
  return publicRecord(result.Item as Record<string, any> | undefined, tenantId);
}

async function listDocuments(tenantId: string): Promise<Record<string, any>[]> {
  const result = await client.send(new ScanCommand({
    TableName: names.documents,
    FilterExpression: 'tenantId = :tenantId',
    ExpressionAttributeValues: { ':tenantId': tenantId },
    ProjectionExpression: 'id, fileName, purpose, category, detectedCategories, documentType, #status, processingStatus, validationStatus, validationIssues, reportingStartDate, reportingEndDate, reportingPeriod, extractedEntityCount, rawMetadata, processedAt, createdAt, updatedAt',
    ExpressionAttributeNames: { '#status': 'status' },
  }));
  return (result.Items || []) as Record<string, any>[];
}

function normalizedCategories(doc: Record<string, any>): string[] {
  const values = Array.isArray(doc.detectedCategories) ? doc.detectedCategories : [doc.purpose, doc.category, doc.documentType];
  const result = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.toUpperCase();
    if (normalized.includes('BANK')) result.add('BANK_ACTIVITY');
    if (normalized.includes('SALE')) result.add('PRODUCT_SALES');
    if (normalized.includes('INVENTORY')) result.add('INVENTORY');
    if (normalized.includes('PURCHASE') || normalized.includes('SUPPLIER')) result.add('PURCHASES');
    if (normalized.includes('OBLIGATION') || normalized.includes('PAYABLE') || normalized.includes('RECEIVABLE')) result.add('OBLIGATIONS');
    if (normalized.includes('RECURR')) result.add('RECURRING_EXPENSES');
  }
  return [...result];
}

function safeDocument(item: Record<string, any>): SafeDocument {
  const detectedCategories = normalizedCategories(item);
  const status = String(item.processingStatus || item.status || 'PENDING');
  const validationStatus = item.validationStatus
    ? String(item.validationStatus)
    : ['EXTRACTED', 'READY'].includes(status.toUpperCase()) ? 'VALID' : 'PENDING';
  const extraction = documentExtractionView(item.rawMetadata);
  return {
    id: String(item.id || ''),
    fileName: String(item.fileName || 'document.pdf'),
    purpose: String(item.purpose || item.category || 'SUPPORTING_DOCUMENT'),
    category: String(item.category || 'OTHER'),
    detectedCategories,
    status,
    validationStatus,
    validationIssues: Array.isArray(item.validationIssues) ? item.validationIssues.filter((value: unknown): value is string => typeof value === 'string') : [],
    reportingStartDate: typeof item.reportingStartDate === 'string' ? item.reportingStartDate : undefined,
    reportingEndDate: typeof item.reportingEndDate === 'string' ? item.reportingEndDate : undefined,
    reportingPeriod: item.reportingPeriod && typeof item.reportingPeriod === 'object' ? item.reportingPeriod : null,
    extractedEntityCount: typeof item.extractedEntityCount === 'number' ? item.extractedEntityCount : undefined,
    ...extraction,
    processedAt: typeof item.processedAt === 'string' ? item.processedAt : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  };
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function daysCovered(start: string, end: string): number {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export async function listOnboardingDocuments(tenantId: string): Promise<SafeDocument[]> {
  return (await listDocuments(tenantId)).map(safeDocument);
}

export async function getReadiness(tenantId: string, onboarding?: OnboardingRecord): Promise<Readiness> {
  const record = onboarding || await getOnboarding(tenantId);
  const rawDocuments = await listDocuments(tenantId);
  const documents = rawDocuments.map(safeDocument);
  const satisfied = new Set<string>();
  const blockers: string[] = [];
  const warnings: string[] = [];
  const today = new Date();
  const trailingStart = new Date(today.getTime() - 89 * 86_400_000).toISOString().slice(0, 10);

  for (const doc of documents) {
    const pending = ['PENDING', 'PROCESSING'].includes(doc.status.toUpperCase()) || ['PENDING', 'PROCESSING'].includes(doc.validationStatus.toUpperCase());
    const invalid = ['FAILED', 'INVALID'].includes(doc.status.toUpperCase()) || ['FAILED', 'INVALID'].includes(doc.validationStatus.toUpperCase());
    if (pending) blockers.push(`${doc.fileName} is still processing.`);
    if (invalid) blockers.push(`${doc.fileName} needs correction before it can be used.`);
    if (!pending && !invalid) for (const category of doc.detectedCategories) satisfied.add(category);
  }

  const profileReady = typeof record.profile.businessName === 'string' && record.profile.businessName.trim().length > 0
    && typeof record.profile.businessType === 'string' && record.profile.businessType.trim().length > 0;
  const financial = record.financialSettings;
  const minimumCashBuffer = Number(financial.minimumCashBuffer);
  const currentCash = Number(financial.currentCash);
  const cashAsOf = financial.currentCashAsOf || financial.asOf || financial.cashAsOf;
  const cashReady = Number.isFinite(minimumCashBuffer) && minimumCashBuffer >= 0
    && typeof financial.ruleType === 'string' && financial.ruleType.trim().length > 0
    && Number.isFinite(currentCash) && currentCash >= 0
    && validDate(cashAsOf);
  if (!profileReady) blockers.push('Business name and business type are required.');
  if (!cashReady) blockers.push('Minimum buffer, buffer rule, current cash, and an as-of date are required.');

  const bankDocuments = documents.filter((doc) => doc.detectedCategories.includes('BANK_ACTIVITY'));
  const bankCoverage = bankDocuments.some((doc) => validDate(doc.reportingStartDate) && validDate(doc.reportingEndDate)
    && daysCovered(doc.reportingStartDate!, doc.reportingEndDate!) >= 90
    && doc.reportingStartDate! <= trailingStart && doc.reportingEndDate! >= today.toISOString().slice(0, 10));
  if (!bankCoverage) blockers.push('Bank activity must cover the trailing 90 days with a confirmed period.');

  const coverage: Readiness['coverage'] = {};
  const applicable = new Set(record.applicableCategories);
  const configuredCoverage = record.coverage || {};
  const categoryLabels: Record<string, string> = {
    BANK_ACTIVITY: 'Bank activity', PRODUCT_SALES: 'Product sales', INVENTORY: 'Inventory', PURCHASES: 'Purchases & suppliers', OBLIGATIONS: 'Open obligations', RECURRING_EXPENSES: 'Recurring expenses',
  };
  const notApplicableKeys: Record<string, [string, string]> = {
    PRODUCT_SALES: ['salesNotApplicable', 'salesNotApplicableReason'],
    INVENTORY: ['inventoryNotApplicable', 'inventoryNotApplicableReason'],
    PURCHASES: ['purchasesNotApplicable', 'purchasesNotApplicableReason'],
    OBLIGATIONS: ['obligationsNotApplicable', 'obligationsNotApplicableReason'],
    RECURRING_EXPENSES: ['recurringExpensesNotApplicable', 'recurringExpensesNotApplicableReason'],
  };
  const categories = ['BANK_ACTIVITY', ...record.applicableCategories.filter((category) => category !== 'BANK_ACTIVITY')];
  for (const category of categories) {
    const covered = satisfied.has(category) && !['PENDING', 'PROCESSING', 'FAILED', 'INVALID'].some((state) => documents.some((doc) => doc.detectedCategories.includes(category) && (doc.status.toUpperCase() === state || doc.validationStatus.toUpperCase() === state)));
    const entry = configuredCoverage[category];
    const [notApplicableKey, reasonKey] = notApplicableKeys[category] || [];
    const confirmationNA = notApplicableKey && record.confirmations[notApplicableKey] === true
      && typeof record.confirmations[reasonKey] === 'string' && String(record.confirmations[reasonKey]).trim().length > 0;
    const notApplicable = Boolean(confirmationNA) || Boolean(entry && typeof entry === 'object' && (entry as any).applicable === false && typeof (entry as any).reason === 'string' && (entry as any).reason.trim().length > 0);
    const reason = confirmationNA ? String(record.confirmations[reasonKey]) : entry && typeof entry === 'object' ? String((entry as any).reason || '') : '';
    const complete = category === 'BANK_ACTIVITY' ? bankCoverage : covered || Boolean(notApplicable);
    coverage[category] = { complete, label: categoryLabels[category] || category, detail: notApplicable ? `Not applicable: ${reason}` : undefined };
    if (!complete) blockers.push(`${categoryLabels[category] || category} needs a validated document or an explicit not-applicable reason.`);
  }
  const attestationsReady = record.attestations.sourceData === true && record.attestations.correctionsReviewed === true;
  if (!attestationsReady) blockers.push('Both final attestations are required.');
  if (documents.some((doc) => doc.status.toUpperCase() === 'READY' && doc.validationIssues.length > 0)) warnings.push('Some documents have validation warnings to review.');
  const coverageValues = Object.values(coverage);
  const score = coverageValues.length === 0 ? 0 : Math.round((coverageValues.filter((item) => item.complete).length / coverageValues.length) * 100);
  return { ready: blockers.length === 0, score, requiredCategories: categories, satisfiedCategories: [...satisfied], coverage, warnings, blockers: [...new Set(blockers)] };
}

const ALLOWED_FIELDS = ['status', 'currentStep', 'profile', 'financialSettings', 'applicableCategories', 'coverage', 'attestations', 'confirmations'] as const;
export type OnboardingPatch = Partial<Pick<OnboardingRecord, (typeof ALLOWED_FIELDS)[number]>>;

export async function updateOnboarding(tenantId: string, patch: OnboardingPatch): Promise<OnboardingRecord> {
  if (patch.status === 'COMPLETED') throw new Error('Use the completion endpoint to complete onboarding.');
  const current = await getOnboarding(tenantId);
  const next = publicRecord({
    ...current,
    ...patch,
    profile: { ...current.profile, ...(patch.profile || {}) },
    financialSettings: { ...current.financialSettings, ...(patch.financialSettings || {}) },
    coverage: { ...current.coverage, ...(patch.coverage || {}) },
    attestations: { ...current.attestations, ...(patch.attestations || {}) },
    confirmations: { ...current.confirmations, ...(patch.confirmations || {}) },
    status: patch.status || (current.status === 'DRAFT' ? 'IN_PROGRESS' : current.status),
    tenantId,
  }, tenantId);
  await client.send(new PutCommand({ TableName: names.onboarding, Item: { ...next, tenantId, updatedAt: new Date().toISOString() } }));
  return next;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function completeOnboarding(
  tenantId: string,
  submittedPatch: OnboardingPatch = {},
): Promise<{ onboarding: OnboardingRecord; readiness: Readiness }> {
  // Completion receives the current client state in the same request. Merge it
  // before readiness evaluation so the final attestations/settings cannot be
  // lost to a stale server-side draft.
  const current = await getOnboarding(tenantId);
  const merged = publicRecord({
    ...current,
    ...submittedPatch,
    profile: { ...current.profile, ...(submittedPatch.profile || {}) },
    financialSettings: { ...current.financialSettings, ...(submittedPatch.financialSettings || {}) },
    coverage: { ...current.coverage, ...(submittedPatch.coverage || {}) },
    attestations: { ...current.attestations, ...(submittedPatch.attestations || {}) },
    confirmations: { ...current.confirmations, ...(submittedPatch.confirmations || {}) },
    tenantId,
  }, tenantId);
  const readiness = await getReadiness(tenantId, merged);
  if (!readiness.ready) {
    const error = new Error('Onboarding is not ready to complete.') as Error & { code: string; readiness: Readiness };
    error.code = 'ONBOARDING_NOT_READY';
    error.readiness = readiness;
    throw error;
  }
  const completedAt = new Date().toISOString();
  const onboarding = publicRecord({ ...merged, status: 'COMPLETED', currentStep: 9, completedAt, readiness, tenantId }, tenantId);
  const profile = merged.profile;
  const financial = merged.financialSettings;
  const minimumCashBuffer = numberValue(financial.minimumCashBuffer);
  const currentCash = numberValue(financial.currentCash);
  const cashAsOf = stringValue(financial.currentCashAsOf || financial.asOf || financial.cashAsOf);
  // Readiness guarantees these values exist. Keep the guards here as well so
  // this projection cannot ever write an invalid required DynamoDB item if the
  // completion function is called outside the HTTP route.
  if (minimumCashBuffer === undefined || currentCash === undefined || !cashAsOf) {
    throw new Error('A valid minimum cash buffer, current cash, and cash as-of date are required.');
  }
  const settings = {
    id: `settings-${tenantId}`,
    tenantId,
    businessName: stringValue(profile.businessName) || 'My Business',
    tradeName: stringValue(profile.tradeName),
    gstin: stringValue(profile.gstin),
    pan: stringValue(profile.pan),
    category: stringValue(profile.businessType || profile.category),
    minimumCashBuffer,
    bufferRuleType: stringValue(financial.ruleType || financial.bufferRuleType) || 'ABSOLUTE_INR',
    defaultForecastHorizonDays: numberValue(financial.defaultForecastHorizonDays) || 60,
    defaultForecastHorizonWeeks: numberValue(financial.defaultForecastHorizonWeeks),
    enableConservativeFallbacks: financial.enableConservativeFallbacks === true,
    createdAt: completedAt,
    updatedAt: completedAt,
    __typename: 'MerchantFinancialSettings',
  };
  const cashSnapshot = {
    id: `cash-${tenantId}-${cashAsOf}`,
    tenantId,
    asOf: cashAsOf,
    bankBalance: currentCash,
    cashOnHand: numberValue(financial.cashOnHand),
    totalLiquidCash: currentCash + (numberValue(financial.cashOnHand) || 0),
    sourceDocumentIds: [],
    createdAt: completedAt,
    updatedAt: completedAt,
    __typename: 'CashPositionSnapshot',
  };
  await client.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: names.settings,
          Item: settings,
          ConditionExpression: 'attribute_not_exists(id) OR tenantId = :tenantId',
          ExpressionAttributeValues: { ':tenantId': tenantId },
        },
      },
      {
        Put: {
          TableName: names.cash,
          Item: cashSnapshot,
          ConditionExpression: 'attribute_not_exists(id) OR tenantId = :tenantId',
          ExpressionAttributeValues: { ':tenantId': tenantId },
        },
      },
      {
        Put: {
          TableName: names.onboarding,
          Item: { ...onboarding, tenantId, updatedAt: completedAt },
          ConditionExpression: 'attribute_not_exists(id) OR tenantId = :tenantId',
          ExpressionAttributeValues: { ':tenantId': tenantId },
        },
      },
    ],
  }));
  return { onboarding, readiness };
}

export async function getOnboardingStatus(tenantId: string): Promise<{ onboarding: OnboardingRecord; readiness: Readiness; documents: SafeDocument[] }> {
  const onboarding = await getOnboarding(tenantId);
  const [readiness, documents] = await Promise.all([
    getReadiness(tenantId, onboarding),
    listOnboardingDocuments(tenantId),
  ]);
  return { onboarding, readiness, documents };
}

export class OnboardingRequiredError extends Error {
  readonly status = 403;
  readonly code = 'ONBOARDING_REQUIRED';
  constructor(public readonly readiness?: Readiness) {
    super('Complete merchant onboarding before opening the workspace.');
    this.name = 'OnboardingRequiredError';
  }
}

export async function requireCompletedOnboarding(requestOrTenantId: Request | string): Promise<string> {
  if (testGateOverride) return testGateOverride(requestOrTenantId);
  const tenantId = typeof requestOrTenantId === 'string'
    ? requestOrTenantId
    : await requirePrincipal(requestOrTenantId);
  const onboarding = await getOnboarding(tenantId);
  if (onboarding.status !== 'COMPLETED') {
    throw new OnboardingRequiredError(await getReadiness(tenantId, onboarding));
  }
  return tenantId;
}
