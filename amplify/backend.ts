import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { documentExtractor } from './functions/document-extractor/resource';
import { ingestionNormalizer } from './functions/ingestion-normalizer/resource';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

/**
 * Define Amplify Gen 2 Backend with Document Ingestion & Extraction Pipeline
 * @see https://docs.amplify.aws/gen2/build-a-backend/
 */
export const backend = defineBackend({
  auth,
  data,
  storage,
  documentExtractor,
  ingestionNormalizer,
});

// Custom CDK Stack for Asynchronous Ingestion & Processing Pipeline (Section 3.2 of Architecture)
const ingestionStack = backend.createStack('IngestionPipelineStack');

// 1. Enable EventBridge notifications on S3 document storage bucket
backend.storage.resources.bucket.enableEventBridgeNotification();

// 2. Grant Bedrock permissions to documentExtractor Lambda
backend.documentExtractor.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream',
    ],
    resources: ['*'],
  })
);

// 3. Grant S3 read access to extractor
backend.storage.resources.bucket.grantRead(backend.documentExtractor.resources.lambda);

// 4. Grant DynamoDB table permissions & pass table names to normalizer Lambda
const docTable = backend.data.resources.tables['DocumentRecord'];
const txnTable = backend.data.resources.tables['Transaction'];
const oblTable = backend.data.resources.tables['Obligation'];
const prodTable = backend.data.resources.tables['Product'];
const purchaseTable = backend.data.resources.tables['Purchase'];
const purchaseLineItemTable = backend.data.resources.tables['PurchaseLineItem'];
const saleTable = backend.data.resources.tables['Sale'];
const saleLineItemTable = backend.data.resources.tables['SaleLineItem'];
const cashTable = backend.data.resources.tables['CashPositionSnapshot'];
const supplierTable = backend.data.resources.tables['SupplierProfile'];
const supplierTermsTable = backend.data.resources.tables['SupplierProductTerms'];
const settingsTable = backend.data.resources.tables['MerchantFinancialSettings'];
const recurringTable = backend.data.resources.tables['RecurringExpense'];

const normalizerTables = [
  docTable,
  txnTable,
  oblTable,
  prodTable,
  purchaseTable,
  purchaseLineItemTable,
  saleTable,
  saleLineItemTable,
  cashTable,
  supplierTable,
  supplierTermsTable,
  settingsTable,
  recurringTable,
];

for (const tbl of normalizerTables) {
  tbl.grantReadWriteData(backend.ingestionNormalizer.resources.lambda);
}

const normalizerLambda = backend.ingestionNormalizer.resources.lambda as lambda.Function;
normalizerLambda.addEnvironment('DOCUMENT_RECORD_TABLE_NAME', docTable.tableName);
normalizerLambda.addEnvironment('TRANSACTION_TABLE_NAME', txnTable.tableName);
normalizerLambda.addEnvironment('OBLIGATION_TABLE_NAME', oblTable.tableName);
normalizerLambda.addEnvironment('PRODUCT_TABLE_NAME', prodTable.tableName);
normalizerLambda.addEnvironment('PURCHASE_TABLE_NAME', purchaseTable.tableName);
normalizerLambda.addEnvironment('PURCHASE_LINE_ITEM_TABLE_NAME', purchaseLineItemTable.tableName);
normalizerLambda.addEnvironment('SALE_TABLE_NAME', saleTable.tableName);
normalizerLambda.addEnvironment('SALE_LINE_ITEM_TABLE_NAME', saleLineItemTable.tableName);
normalizerLambda.addEnvironment('CASH_POSITION_TABLE_NAME', cashTable.tableName);
normalizerLambda.addEnvironment('SUPPLIER_PROFILE_TABLE_NAME', supplierTable.tableName);
normalizerLambda.addEnvironment('SUPPLIER_PRODUCT_TERMS_TABLE_NAME', supplierTermsTable.tableName);
normalizerLambda.addEnvironment('MERCHANT_SETTINGS_TABLE_NAME', settingsTable.tableName);
normalizerLambda.addEnvironment('RECURRING_EXPENSE_TABLE_NAME', recurringTable.tableName);

// 5. Build Step Functions State Machine
const extractTask = new tasks.LambdaInvoke(ingestionStack, 'ExtractDocumentDataTask', {
  lambdaFunction: backend.documentExtractor.resources.lambda,
  outputPath: '$.Payload',
  taskTimeout: sfn.Timeout.duration(Duration.seconds(120)),
  retryOnServiceExceptions: true,
});

extractTask.addRetry({
  errors: [
    'BedrockThrottlingException',
    'Lambda.ServiceException',
    'Lambda.AWSLambdaException',
    'Lambda.SdkClientException',
    'States.TaskFailed',
  ],
  interval: Duration.seconds(3),
  maxAttempts: 3,
  backoffRate: 2.0,
});

const normalizeTask = new tasks.LambdaInvoke(ingestionStack, 'NormalizeAndPersistTask', {
  lambdaFunction: backend.ingestionNormalizer.resources.lambda,
  outputPath: '$.Payload',
  taskTimeout: sfn.Timeout.duration(Duration.seconds(60)),
  retryOnServiceExceptions: true,
});

normalizeTask.addRetry({
  errors: [
    'Lambda.ServiceException',
    'Lambda.AWSLambdaException',
    'Lambda.SdkClientException',
    'States.TaskFailed',
  ],
  interval: Duration.seconds(2),
  maxAttempts: 2,
  backoffRate: 2.0,
});

const pipelineChain = extractTask.next(normalizeTask);

const ingestionStateMachine = new sfn.StateMachine(ingestionStack, 'DocumentIngestionStateMachine', {
  stateMachineName: 'finfine-document-ingestion-pipeline',
  definitionBody: sfn.DefinitionBody.fromChainable(pipelineChain),
  timeout: Duration.minutes(5),
});

// 6. EventBridge Rule: Trigger Step Functions on S3 ObjectCreated events
const s3UploadRule = new events.Rule(ingestionStack, 'S3DocumentUploadRule', {
  ruleName: 'finfine-s3-document-created-rule',
  description: 'Triggers ingestion state machine when a financial document is uploaded to S3',
  eventPattern: {
    source: ['aws.s3'],
    detailType: ['Object Created'],
    detail: {
      bucket: {
        name: [backend.storage.resources.bucket.bucketName],
      },
      object: {
        key: [{ prefix: 'public/' }, { prefix: 'tenants/' }, { prefix: 'uploads/' }],
      },
    },
  },
});

s3UploadRule.addTarget(new targets.SfnStateMachine(ingestionStateMachine));

// 7. Add Custom Outputs to amplify_outputs.json
backend.addOutput({
  custom: {
    ingestionStateMachineArn: ingestionStateMachine.stateMachineArn,
    documentExtractorLambdaArn: backend.documentExtractor.resources.lambda.functionArn,
    ingestionNormalizerLambdaArn: backend.ingestionNormalizer.resources.lambda.functionArn,
    documentRecordTableName: docTable.tableName,
    transactionTableName: txnTable.tableName,
    obligationTableName: oblTable.tableName,
    productTableName: prodTable.tableName,
    purchaseTableName: purchaseTable.tableName,
    purchaseLineItemTableName: purchaseLineItemTable.tableName,
    saleTableName: saleTable.tableName,
    saleLineItemTableName: saleLineItemTable.tableName,
    cashPositionTableName: cashTable.tableName,
    supplierProfileTableName: supplierTable.tableName,
    supplierProductTermsTableName: supplierTermsTable.tableName,
    merchantSettingsTableName: settingsTable.tableName,
    recurringExpenseTableName: recurringTable.tableName,
  },
});
