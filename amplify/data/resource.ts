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
      tenantId: a.string(),
      fileName: a.string(),
      s3Key: a.string().required(),
      fileType: a.string(),
      documentType: a.string(), // 'BANK_STATEMENT' | 'INVOICE' | 'RECEIPT' | 'GST_CHALLAN' | 'OTHER'
      status: a.string().required(), // 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'FAILED'
      extractedEntityCount: a.integer(),
      rawMetadata: a.json(),
      errorMessage: a.string(),
      processedAt: a.datetime(),
    })
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  Transaction: a
    .model({
      tenantId: a.string(),
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
    })
    .authorization((allow) => [allow.guest(), allow.authenticated()]),

  Obligation: a
    .model({
      tenantId: a.string(),
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
    })
    .authorization((allow) => [allow.guest(), allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
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
