import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { invalidateDashboardCache } from './financial-store';

const region = process.env.AWS_REGION || 'ap-south-1';
const tenantId = process.env.FINFINE_TENANT_ID || 'msme-001';

const obTableName = process.env.OBLIGATION_TABLE_NAME || 'Obligation-ifsueqzwybf6nau7duulv5qweq-NONE';
const recurringExpenseTableName = process.env.RECURRING_EXPENSE_TABLE_NAME || 'RecurringExpense-ifsueqzwybf6nau7duulv5qweq-NONE';
const supplierProfileTableName = process.env.SUPPLIER_PROFILE_TABLE_NAME || 'SupplierProfile-ifsueqzwybf6nau7duulv5qweq-NONE';

const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// Types
// ============================================================================

export type ObligationType = 'PAYABLE' | 'RECEIVABLE';

export type ObligationCategory =
  | 'GST_PAYMENT'
  | 'TDS_PAYMENT'
  | 'VENDOR_BILL'
  | 'UTILITY_BILL'
  | 'SALARY'
  | 'CUSTOMER_INVOICE'
  | 'OTHER';

export type ObligationStatus = 'SCHEDULED' | 'PAID' | 'OVERDUE' | 'DISPUTED';

export type ExpenseFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface ObligationRecord {
  id: string;
  tenantId: string;
  documentId?: string;
  title: string;
  counterpartyName?: string;
  statutoryId?: string;
  amount: number;
  dueDate?: string;
  type: ObligationType;
  category?: ObligationCategory;
  priorityWeight?: number;
  penaltyRatePerDay?: number;
  isStatutory?: boolean;
  status?: ObligationStatus;
  supplierId?: string;
  productId?: string;
  allowPartialPayment?: boolean;
  expectedSettlementDate?: string;
  probability?: number;
  confidence?: string;
  priorityOverride?: number;
  priorityOverrideReason?: string;
  sourceRecordIds?: string[];
  // Recurrence metadata (stored only for display, not schema)
  isRecurring?: boolean;
  recurringExpenseId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecurringExpenseRecord {
  id: string;
  tenantId: string;
  expenseType: string;
  amount: number;
  frequency: ExpenseFrequency;
  dueDayOfMonth?: number;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  notes?: string;
  linkedObligationCategory?: string;
  counterpartyName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ObligationFilters {
  type?: ObligationType;
  category?: ObligationCategory;
  status?: ObligationStatus;
  fromDate?: string;
  toDate?: string;
}

export interface CreateObligationInput {
  title: string;
  counterpartyName?: string;
  amount: number;
  dueDate?: string;
  type: ObligationType;
  category?: ObligationCategory;
  isStatutory?: boolean;
  penaltyRatePerDay?: number;
  supplierId?: string;
  productId?: string;
  allowPartialPayment?: boolean;
  // Recurrence fields
  isRecurring?: boolean;
  frequency?: ExpenseFrequency;
  dueDayOfMonth?: number;
  notes?: string;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

// ============================================================================
// Obligation CRUD
// ============================================================================

/**
 * List all obligations for a tenant with optional filters.
 */
export async function listObligations(
  targetTenantId = tenantId,
  filters?: ObligationFilters
): Promise<ObligationRecord[]> {
  try {
    let filterExpressions = ['tenantId = :tid'];
    const expressionValues: Record<string, any> = { ':tid': targetTenantId };

    if (filters?.type) {
      filterExpressions.push('#oblType = :oblType');
      expressionValues[':oblType'] = filters.type;
    }
    if (filters?.category) {
      filterExpressions.push('category = :cat');
      expressionValues[':cat'] = filters.category;
    }
    if (filters?.status) {
      filterExpressions.push('#oblStatus = :oblStatus');
      expressionValues[':oblStatus'] = filters.status;
    }
    if (filters?.fromDate) {
      filterExpressions.push('dueDate >= :fromDate');
      expressionValues[':fromDate'] = filters.fromDate;
    }
    if (filters?.toDate) {
      filterExpressions.push('dueDate <= :toDate');
      expressionValues[':toDate'] = filters.toDate;
    }

    // Build expression attribute names for reserved words
    const expressionNames: Record<string, string> = {};
    if (filters?.type) expressionNames['#oblType'] = 'type';
    if (filters?.status) expressionNames['#oblStatus'] = 'status';

    const res = await docClient.send(
      new ScanCommand({
        TableName: obTableName,
        FilterExpression: filterExpressions.join(' AND '),
        ExpressionAttributeValues: expressionValues,
        ...(Object.keys(expressionNames).length > 0
          ? { ExpressionAttributeNames: expressionNames }
          : {}),
      })
    );

    const items = (res.Items || []) as ObligationRecord[];
    // Sort by dueDate ascending, then by priority weight descending
    items.sort((a, b) => {
      const dateA = a.dueDate || '9999-12-31';
      const dateB = b.dueDate || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (b.priorityWeight || 0) - (a.priorityWeight || 0);
    });

    return items;
  } catch (err) {
    console.warn('Error listing obligations:', err);
    return [];
  }
}

/**
 * Get a single obligation by ID.
 */
export async function getObligation(id: string): Promise<ObligationRecord | null> {
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: obTableName,
        Key: { id },
      })
    );
    return (res.Item as ObligationRecord) || null;
  } catch (err) {
    console.warn('Error getting obligation:', err);
    return null;
  }
}

/**
 * Base priority weights by category (from DATA_SCHEMA_CHANGES_REQUIRED.md Section 7).
 */
const CATEGORY_PRIORITY_WEIGHTS: Record<string, number> = {
  GST_PAYMENT: 1.0,
  TDS_PAYMENT: 1.0,
  SALARY: 0.9,
  UTILITY_BILL: 0.85,
  VENDOR_BILL: 0.7,
  CUSTOMER_INVOICE: 0.6,
  OTHER: 0.4,
};

/**
 * Create a new obligation. If isRecurring, also creates a RecurringExpense.
 */
export async function createObligation(
  input: CreateObligationInput,
  targetTenantId = tenantId
): Promise<ObligationRecord> {
  const now = new Date().toISOString();
  const oblId = generateId('obl');

  const priorityWeight = CATEGORY_PRIORITY_WEIGHTS[input.category || 'OTHER'] || 0.4;
  const isStatutory = input.category === 'GST_PAYMENT' || input.category === 'TDS_PAYMENT' || input.isStatutory;

  const obligation: ObligationRecord = {
    id: oblId,
    tenantId: targetTenantId,
    title: input.title,
    counterpartyName: input.counterpartyName,
    amount: input.amount,
    dueDate: input.dueDate,
    type: input.type,
    category: input.category || 'OTHER',
    priorityWeight,
    isStatutory: isStatutory || false,
    penaltyRatePerDay: input.penaltyRatePerDay,
    status: 'SCHEDULED',
    supplierId: input.supplierId,
    productId: input.productId,
    allowPartialPayment: input.allowPartialPayment,
    isRecurring: input.isRecurring || false,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: obTableName,
      Item: obligation,
    })
  );

  // If recurring, create a RecurringExpense record
  if (input.isRecurring && input.frequency) {
    const recId = generateId('rec');
    const recurringExpense: RecurringExpenseRecord = {
      id: recId,
      tenantId: targetTenantId,
      expenseType: input.category || 'OTHER',
      amount: input.amount,
      frequency: input.frequency,
      dueDayOfMonth: input.dueDayOfMonth,
      startDate: input.dueDate,
      isActive: true,
      notes: input.notes || `Recurring: ${input.title}`,
      linkedObligationCategory: input.category,
      counterpartyName: input.counterpartyName,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: recurringExpenseTableName,
        Item: recurringExpense,
      })
    );

    obligation.recurringExpenseId = recId;
    // Update the obligation with the linked recurring expense ID
    await docClient.send(
      new PutCommand({
        TableName: obTableName,
        Item: obligation,
      })
    );
  }

  invalidateDashboardCache();
  return obligation;
}

/**
 * Update an existing obligation.
 */
export async function updateObligation(
  id: string,
  updates: Partial<ObligationRecord>
): Promise<ObligationRecord | null> {
  const existing = await getObligation(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: ObligationRecord = {
    ...existing,
    ...updates,
    id, // Ensure ID doesn't change
    tenantId: existing.tenantId, // Ensure tenantId doesn't change
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: obTableName,
      Item: updated,
    })
  );

  // If marking as PAID and this is a recurring obligation, roll over to next period
  if (updates.status === 'PAID' && existing.isRecurring && existing.recurringExpenseId) {
    await rolloverRecurringObligation(existing);
  }

  invalidateDashboardCache();
  return updated;
}

/**
 * Delete an obligation.
 */
export async function deleteObligation(id: string): Promise<boolean> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: obTableName,
        Key: { id },
      })
    );
    invalidateDashboardCache();
    return true;
  } catch (err) {
    console.warn('Error deleting obligation:', err);
    return false;
  }
}

// ============================================================================
// Recurrence Logic
// ============================================================================

/**
 * Compute the next due date based on frequency.
 */
function computeNextDueDate(currentDueDate: string, frequency: ExpenseFrequency, dueDayOfMonth?: number): string {
  const current = new Date(currentDueDate);

  switch (frequency) {
    case 'DAILY':
      current.setDate(current.getDate() + 1);
      break;
    case 'WEEKLY':
      current.setDate(current.getDate() + 7);
      break;
    case 'MONTHLY': {
      current.setMonth(current.getMonth() + 1);
      if (dueDayOfMonth) {
        const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        current.setDate(Math.min(dueDayOfMonth, maxDay));
      }
      break;
    }
    case 'QUARTERLY':
      current.setMonth(current.getMonth() + 3);
      if (dueDayOfMonth) {
        const maxDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        current.setDate(Math.min(dueDayOfMonth, maxDay));
      }
      break;
  }

  return current.toISOString().slice(0, 10);
}

/**
 * When a recurring obligation is paid, create the next occurrence automatically.
 */
async function rolloverRecurringObligation(paidObligation: ObligationRecord): Promise<ObligationRecord | null> {
  if (!paidObligation.recurringExpenseId) return null;

  // Fetch the linked recurring expense to get frequency details
  let recurringExpense: RecurringExpenseRecord | null = null;
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: recurringExpenseTableName,
        Key: { id: paidObligation.recurringExpenseId },
      })
    );
    recurringExpense = (res.Item as RecurringExpenseRecord) || null;
  } catch (err) {
    console.warn('Error fetching recurring expense for rollover:', err);
    return null;
  }

  if (!recurringExpense || !recurringExpense.isActive) return null;

  // Check if end date is reached
  if (recurringExpense.endDate && paidObligation.dueDate && paidObligation.dueDate >= recurringExpense.endDate) {
    return null;
  }

  const nextDueDate = computeNextDueDate(
    paidObligation.dueDate || new Date().toISOString().slice(0, 10),
    recurringExpense.frequency,
    recurringExpense.dueDayOfMonth
  );

  const now = new Date().toISOString();
  const newOblId = generateId('obl');

  const nextObligation: ObligationRecord = {
    id: newOblId,
    tenantId: paidObligation.tenantId,
    title: paidObligation.title,
    counterpartyName: paidObligation.counterpartyName,
    amount: recurringExpense.amount, // Use recurring amount (may have been updated)
    dueDate: nextDueDate,
    type: paidObligation.type,
    category: paidObligation.category,
    priorityWeight: paidObligation.priorityWeight,
    isStatutory: paidObligation.isStatutory,
    penaltyRatePerDay: paidObligation.penaltyRatePerDay,
    status: 'SCHEDULED',
    supplierId: paidObligation.supplierId,
    productId: paidObligation.productId,
    allowPartialPayment: paidObligation.allowPartialPayment,
    isRecurring: true,
    recurringExpenseId: paidObligation.recurringExpenseId,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: obTableName,
      Item: nextObligation,
    })
  );

  return nextObligation;
}

// ============================================================================
// Supplier Upsert (for supplier obligations)
// ============================================================================

/**
 * Create or update a supplier profile when adding supplier obligations.
 */
export async function upsertSupplierProfile(data: {
  supplierName: string;
  creditPeriodDays?: number;
  paymentTermsText?: string;
  notes?: string;
}, targetTenantId = tenantId): Promise<string> {
  // Check if supplier already exists by name
  try {
    const res = await docClient.send(
      new ScanCommand({
        TableName: supplierProfileTableName,
        FilterExpression: 'tenantId = :tid AND supplierName = :name',
        ExpressionAttributeValues: {
          ':tid': targetTenantId,
          ':name': data.supplierName,
        },
      })
    );

    if (res.Items && res.Items.length > 0) {
      // Update existing
      const existing = res.Items[0];
      const now = new Date().toISOString();
      await docClient.send(
        new PutCommand({
          TableName: supplierProfileTableName,
          Item: {
            ...existing,
            ...(data.creditPeriodDays !== undefined ? { creditPeriodDays: data.creditPeriodDays } : {}),
            ...(data.paymentTermsText ? { paymentTermsText: data.paymentTermsText } : {}),
            ...(data.notes ? { notes: data.notes } : {}),
            updatedAt: now,
          },
        })
      );
      return existing.id as string;
    }
  } catch (err) {
    console.warn('Error searching for existing supplier:', err);
  }

  // Create new supplier
  const now = new Date().toISOString();
  const supplierId = generateId('sup');
  await docClient.send(
    new PutCommand({
      TableName: supplierProfileTableName,
      Item: {
        id: supplierId,
        tenantId: targetTenantId,
        supplierName: data.supplierName,
        creditPeriodDays: data.creditPeriodDays,
        paymentTermsText: data.paymentTermsText,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  return supplierId;
}
