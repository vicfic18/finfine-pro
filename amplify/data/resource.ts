import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any unauthenticated user can "create", "read", "update", 
and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  DocumentRecord: a
    .model({
      tenantId: a.string().required(),
      fileName: a.string(),
      s3Key: a.string().required(),
      fileType: a.string(),
      documentType: a.string(), // 'BANK_STATEMENT' | 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'OTHER'
      status: a.string().required(), // 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED'
      extractedEntityCount: a.integer(),
      rawMetadata: a.json(),
      errorMessage: a.string(),
      processedAt: a.datetime(),
      sourceRecordIds: a.string().array(),
      purpose: a.string(),
      category: a.string(),
      detectedCategories: a.string().array(),
      reportingStartDate: a.string(),
      reportingEndDate: a.string(),
      reportingPeriod: a.json(),
      validationStatus: a.string(),
      validationIssues: a.string().array(),
      readinessLink: a.string(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  Transaction: a
    .model({
      tenantId: a.string().required(),
      documentId: a.string(),
      date: a.string().required(), // YYYY-MM-DD
      amount: a.float().required(),
      type: a.string().required(), // 'INFLOW' | 'OUTFLOW'
      paymentMode: a.string(), // 'UPI' | 'NEFT' | 'IMPS' | 'CARD' | 'CASH' | 'CHEQUE' | 'AUTOPAY' | 'OTHER'
      counterpartyName: a.string(),
      counterpartyIdentifier: a.string(), // UPI VPA / Account #
      category: a.string(), // 'CUSTOMER_RECEIPT' | 'VENDOR_PAYMENT' | 'STATUTORY_TAX' | 'UTILITY' | 'SALARY' | 'OPERATING_EXPENSE' | 'LOAN_EMI' | 'OTHER'
      statutoryId: a.string(), // GSTIN or PAN
      priorityWeight: a.float(), // 0.0 - 1.0 (for deterministic solvency engine)
      balanceAfterTransaction: a.float(),
      referenceNumber: a.string(), // UTR / UPI Ref ID
      description: a.string(),
      status: a.string(), // 'CONFIRMED' | 'PENDING' | 'RECONCILED'
      // Analytics reconciliation references
      productId: a.string(),
      supplierId: a.string(),
      saleId: a.string(),
      purchaseId: a.string(),
      obligationId: a.string(),
      sourceRecordIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  Obligation: a
    .model({
      tenantId: a.string().required(),
      documentId: a.string(),
      title: a.string().required(),
      counterpartyName: a.string(),
      statutoryId: a.string(),
      amount: a.float().required(),
      dueDate: a.string(), // YYYY-MM-DD
      type: a.string().required(), // 'PAYABLE' | 'RECEIVABLE'
      category: a.string(), // 'GST_PAYMENT' | 'TDS_PAYMENT' | 'VENDOR_BILL' | 'UTILITY_BILL' | 'CUSTOMER_INVOICE' | 'SALARY' | 'OTHER'
      priorityWeight: a.float(),
      penaltyRatePerDay: a.float(),
      isStatutory: a.boolean(),
      status: a.string(), // 'SCHEDULED' | 'PAID' | 'OVERDUE' | 'DISPUTED'
      // Analytics extensions & receivable attributes
      supplierId: a.string(),
      productId: a.string(),
      allowPartialPayment: a.boolean(),
      expectedSettlementDate: a.string(), // YYYY-MM-DD
      probability: a.float(), // 0.0 - 1.0
      confidence: a.string(), // 'HIGH' | 'MEDIUM' | 'LOW'
      priorityOverride: a.float(),
      priorityOverrideReason: a.string(),
      sourceRecordIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  MerchantFinancialSettings: a
    .model({
      tenantId: a.string().required(),
      businessName: a.string(),
      tradeName: a.string(),
      gstin: a.string(),
      pan: a.string(),
      category: a.string(),
      minimumCashBuffer: a.float().required(),
      bufferRuleType: a.string(), // 'ABSOLUTE_INR' | 'DAYS_OF_EXPENSE'
      defaultForecastHorizonDays: a.integer(),
      defaultForecastHorizonWeeks: a.integer(),
      lowRunwayAlertDays: a.integer(),
      enableConservativeFallbacks: a.boolean(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  CashPositionSnapshot: a
    .model({
      tenantId: a.string().required(),
      asOf: a.string().required(), // ISO Date: YYYY-MM-DD
      bankBalance: a.float().required(),
      cashOnHand: a.float(),
      totalLiquidCash: a.float().required(),
      sourceDocumentIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  Product: a
    .model({
      tenantId: a.string().required(),
      name: a.string().required(),
      sku: a.string(),
      category: a.string(),
      unitOfMeasure: a.string().required(),
      isActive: a.boolean().required(),
      aliases: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  Sale: a
    .model({
      tenantId: a.string().required(),
      saleDate: a.string().required(), // YYYY-MM-DD
      channel: a.string(),
      customerName: a.string(),
      grossAmount: a.float().required(),
      discountAmount: a.float(),
      netSalesAmount: a.float().required(),
      documentId: a.string(),
      sourceRecordIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  SaleLineItem: a
    .model({
      tenantId: a.string().required(),
      saleId: a.string().required(),
      productId: a.string().required(),
      quantity: a.float().required(),
      unitSellingPrice: a.float().required(),
      grossAmount: a.float().required(),
      discountAmount: a.float(),
      returnQuantity: a.float(),
      netSalesAmount: a.float().required(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  InventorySnapshot: a
    .model({
      tenantId: a.string().required(),
      snapshotDate: a.string().required(), // YYYY-MM-DD
      sourceType: a.string(), // 'MANUAL' | 'DOCUMENT' | 'POS' | 'SYSTEM'
      documentId: a.string(),
      sourceRecordIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  InventoryItem: a
    .model({
      tenantId: a.string().required(),
      inventorySnapshotId: a.string().required(),
      productId: a.string().required(),
      quantityOnHand: a.float().required(),
      unitPurchaseCost: a.float(),
      inventoryValue: a.float(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  Purchase: a
    .model({
      tenantId: a.string().required(),
      purchaseDate: a.string().required(), // YYYY-MM-DD
      supplierId: a.string(),
      supplierName: a.string(),
      totalAmount: a.float().required(),
      documentId: a.string(),
      obligationId: a.string(),
      sourceRecordIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  PurchaseLineItem: a
    .model({
      tenantId: a.string().required(),
      purchaseId: a.string().required(),
      productId: a.string().required(),
      quantity: a.float().required(),
      unitPurchaseCost: a.float().required(),
      totalPurchaseAmount: a.float().required(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  SupplierProfile: a
    .model({
      tenantId: a.string().required(),
      supplierName: a.string().required(),
      leadTimeDays: a.integer(),
      creditPeriodDays: a.integer(),
      minimumOrderQuantity: a.float(),
      deliveryCost: a.float(),
      paymentTermsText: a.string(),
      reliabilityScore: a.float(),
      notes: a.string(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  SupplierProductTerms: a
    .model({
      tenantId: a.string().required(),
      supplierId: a.string().required(),
      productId: a.string().required(),
      quotedUnitPrice: a.float(),
      minimumOrderQuantity: a.float(),
      leadTimeDays: a.integer(),
      discountPercent: a.float(),
      discountThresholdQuantity: a.float(),
      deliveryCost: a.float(),
      effectiveFrom: a.string(),
      effectiveTo: a.string(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  PurchaseOrder: a
    .model({
      tenantId: a.string().required(),
      supplierId: a.string(),
      orderDate: a.string().required(), // YYYY-MM-DD
      expectedDeliveryDate: a.string(),
      status: a.string().required(), // 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
      documentId: a.string(),
      sourceRecordIds: a.string().array(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  PurchaseOrderLineItem: a
    .model({
      tenantId: a.string().required(),
      purchaseOrderId: a.string().required(),
      productId: a.string().required(),
      orderedQuantity: a.float().required(),
      receivedQuantity: a.float(),
      unitPurchaseCost: a.float(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  RecurringExpense: a
    .model({
      tenantId: a.string().required(),
      expenseType: a.string().required(),
      amount: a.float().required(),
      frequency: a.string().required(), // 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'
      dueDayOfMonth: a.integer(),
      startDate: a.string(),
      endDate: a.string(),
      isActive: a.boolean().required(),
      notes: a.string(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  MerchantOnboarding: a
    .model({
      tenantId: a.string().required(),
      status: a.string().required(),
      currentStep: a.integer().required(),
      profile: a.json(),
      financialSettings: a.json(),
      applicableCategories: a.string().array(),
      coverage: a.json(),
      attestations: a.json(),
      confirmations: a.json(),
      readiness: a.json(),
      completedAt: a.datetime(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  MerchantFieldConfirmation: a
    .model({
      tenantId: a.string().required(),
      documentId: a.string().required(),
      category: a.string().required(),
      fieldPath: a.string().required(),
      extractedValue: a.json(),
      confirmedValue: a.json().required(),
      correctionType: a.string().required(),
      reason: a.string(),
      asOf: a.string().required(),
      confirmedBy: a.string().required(),
      confirmedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),

  ExpectedReceivable: a
    .model({
      tenantId: a.string().required(),
      customerName: a.string().required(),
      amount: a.float().required(),
      dueDate: a.string(),
      confidence: a.string(),
      sourceDocumentId: a.string(),
    })
    .authorization((allow) => [allow.ownerDefinedIn('tenantId').identityClaim('sub')]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
