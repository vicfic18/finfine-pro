import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { documentExtractor } from './functions/document-extractor/resource';
import { ingestionNormalizer } from './functions/ingestion-normalizer/resource';
import { statutoryAdvisoryCron } from './functions/statutory-advisory-cron/resource';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration } from 'aws-cdk-lib';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load env variables from local files during CDK synthesis
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const key = k.trim();
        const val = v.join('=').trim();
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.join(__dirname, '../agent_backend/.env'));
loadEnvFile(path.join(__dirname, '../.env'));

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
  statutoryAdvisoryCron,
});

const agentSessionPrefix = 'agent-sessions/';
const agentSessionRetentionDays = Number.parseInt(
  process.env.FINFINE_AGENT_SESSION_RETENTION_DAYS ?? '30',
  10
);

if (!Number.isInteger(agentSessionRetentionDays) || agentSessionRetentionDays < 1) {
  throw new Error('FINFINE_AGENT_SESSION_RETENTION_DAYS must be a positive integer');
}

// Agent snapshots are written only by the server-side runtime under a private prefix.
backend.storage.resources.cfnResources.cfnBucket.lifecycleConfiguration = {
  rules: [
    {
      id: 'ExpireAgentSessions',
      prefix: agentSessionPrefix,
      expirationInDays: agentSessionRetentionDays,
      status: 'Enabled',
    },
  ],
};
backend.storage.resources.cfnResources.cfnBucket.bucketEncryption = {
  serverSideEncryptionConfiguration: [
    {
      serverSideEncryptionByDefault: {
        sseAlgorithm: 'AES256',
      },
    },
  ],
};

// Custom CDK Stack for Asynchronous Ingestion & Processing Pipeline (Section 3.2 of Architecture)
const ingestionStack = backend.createStack('IngestionPipelineStack');

// 1. Enable EventBridge notifications on S3 document storage bucket
backend.storage.resources.bucket.enableEventBridgeNotification();

// 2. Grant S3 read access to extractor
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
const inventorySnapshotTable = backend.data.resources.tables['InventorySnapshot'];
const inventoryItemTable = backend.data.resources.tables['InventoryItem'];
const purchaseOrderTable = backend.data.resources.tables['PurchaseOrder'];
const purchaseOrderLineItemTable = backend.data.resources.tables['PurchaseOrderLineItem'];
const onboardingTable = backend.data.resources.tables['MerchantOnboarding'];
const fieldConfirmationTable = backend.data.resources.tables['MerchantFieldConfirmation'];
const expectedReceivableTable = backend.data.resources.tables['ExpectedReceivable'];

// The upload manifest is authoritative for tenant, purpose, and category. The
// EventBridge S3 event carries the bucket/key but not the application metadata.
const extractorLambda = backend.documentExtractor.resources.lambda as lambda.Function;
docTable.grantReadData(extractorLambda);
extractorLambda.addEnvironment('DOCUMENT_RECORD_TABLE_NAME', docTable.tableName);

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
  inventorySnapshotTable,
  inventoryItemTable,
  purchaseOrderTable,
  purchaseOrderLineItemTable,
  onboardingTable,
  fieldConfirmationTable,
  expectedReceivableTable,
];

const agentTables = [
  ...normalizerTables,
  inventorySnapshotTable,
  inventoryItemTable,
  purchaseOrderTable,
  purchaseOrderLineItemTable,
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
normalizerLambda.addEnvironment('INVENTORY_SNAPSHOT_TABLE_NAME', inventorySnapshotTable.tableName);
normalizerLambda.addEnvironment('INVENTORY_ITEM_TABLE_NAME', inventoryItemTable.tableName);
normalizerLambda.addEnvironment('PURCHASE_ORDER_TABLE_NAME', purchaseOrderTable.tableName);
normalizerLambda.addEnvironment('PURCHASE_ORDER_LINE_ITEM_TABLE_NAME', purchaseOrderLineItemTable.tableName);
normalizerLambda.addEnvironment('MERCHANT_ONBOARDING_TABLE_NAME', onboardingTable.tableName);
normalizerLambda.addEnvironment('MERCHANT_FIELD_CONFIRMATION_TABLE_NAME', fieldConfirmationTable.tableName);
normalizerLambda.addEnvironment('EXPECTED_RECEIVABLE_TABLE_NAME', expectedReceivableTable.tableName);

// 5. Build Step Functions State Machine
const extractTask = new tasks.LambdaInvoke(ingestionStack, 'ExtractDocumentDataTask', {
  lambdaFunction: backend.documentExtractor.resources.lambda,
  outputPath: '$.Payload',
  taskTimeout: sfn.Timeout.duration(Duration.seconds(120)),
  retryOnServiceExceptions: true,
});

extractTask.addRetry({
  errors: [
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
        key: [{ prefix: 'tenants/' }],
      },
    },
  },
});

s3UploadRule.addTarget(new targets.SfnStateMachine(ingestionStateMachine));

// 7. Scale-to-Zero Serverless Agent Backend Stack
const agentStack = backend.createStack('AgentBackendStack');
const allowedOrigins = (process.env.FINFINE_ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const voiceTranscriberLambda = new nodejs.NodejsFunction(agentStack, 'FinFineVoiceTranscriberFunction', {
  entry: path.join(__dirname, 'functions/voice-transcriber/handler.ts'),
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_22_X,
  memorySize: 512,
  timeout: Duration.seconds(60),
  environment: {
    VOICE_AWS_REGION: process.env.VOICE_AWS_REGION || 'ap-south-1',
  },
});

voiceTranscriberLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['transcribe:StartStreamTranscription'],
  resources: ['*'],
}));

const agentEcrRepo = ecr.Repository.fromRepositoryName(agentStack, 'FinFineAgentBackendRepo', 'finfine-agent-backend');

const agentLambda = new lambda.DockerImageFunction(agentStack, 'FinFineAgentBackendFunction', {
  architecture: lambda.Architecture.X86_64,
  code: lambda.DockerImageCode.fromEcr(agentEcrRepo, {
    tagOrDigest: 'v1',
  }),
  memorySize: 1024,
  timeout: Duration.seconds(180),
  environment: {
    DOCUMENT_RECORD_TABLE_NAME: docTable.tableName,
    TRANSACTION_TABLE_NAME: txnTable.tableName,
    OBLIGATION_TABLE_NAME: oblTable.tableName,
    PRODUCT_TABLE_NAME: prodTable.tableName,
    PURCHASE_TABLE_NAME: purchaseTable.tableName,
    PURCHASE_LINE_ITEM_TABLE_NAME: purchaseLineItemTable.tableName,
    SALE_TABLE_NAME: saleTable.tableName,
    SALE_LINE_ITEM_TABLE_NAME: saleLineItemTable.tableName,
    CASH_POSITION_TABLE_NAME: cashTable.tableName,
    SUPPLIER_PROFILE_TABLE_NAME: supplierTable.tableName,
    SUPPLIER_PRODUCT_TERMS_TABLE_NAME: supplierTermsTable.tableName,
    MERCHANT_SETTINGS_TABLE_NAME: settingsTable.tableName,
    RECURRING_EXPENSE_TABLE_NAME: recurringTable.tableName,
    INVENTORY_SNAPSHOT_TABLE_NAME: inventorySnapshotTable.tableName,
    INVENTORY_ITEM_TABLE_NAME: inventoryItemTable.tableName,
    PURCHASE_ORDER_TABLE_NAME: purchaseOrderTable.tableName,
    PURCHASE_ORDER_LINE_ITEM_TABLE_NAME: purchaseOrderLineItemTable.tableName,
    MERCHANT_ONBOARDING_TABLE_NAME: onboardingTable.tableName,
    MERCHANT_FIELD_CONFIRMATION_TABLE_NAME: fieldConfirmationTable.tableName,
    EXPECTED_RECEIVABLE_TABLE_NAME: expectedReceivableTable.tableName,
    CODE_EXECUTOR_FUNCTION_NAME: 'finfine-code-executor',
    CODE_EXECUTOR_REGION: agentStack.region,
    MODEL_BASE_URL: process.env.MODEL_BASE_URL || 'https://api.groq.com/openai/v1',
    MODEL_ID: process.env.MODEL_ID || 'qwen/qwen3.8-27b',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.MODEL_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    MODEL_API_KEY: process.env.MODEL_API_KEY || process.env.GROQ_API_KEY || '',
    FINFINE_ALLOWED_ORIGINS: allowedOrigins.join(','),
    COGNITO_USER_POOL_ID: backend.auth.resources.userPool.userPoolId,
    COGNITO_CLIENT_ID: backend.auth.resources.userPoolClient.userPoolClientId,
    AGENT_SESSION_BUCKET_NAME: backend.storage.resources.bucket.bucketName,
    AGENT_SESSION_PREFIX: agentSessionPrefix,
    AGENT_SESSION_RETENTION_DAYS: agentSessionRetentionDays.toString(),
    AGENT_SESSION_REGION: agentStack.region,
    VOICE_AWS_REGION: process.env.VOICE_AWS_REGION || 'ap-south-1',
    VOICE_TRANSCRIBER_MODE: 'lambda',
    VOICE_TRANSCRIBER_REGION: agentStack.region,
    VOICE_TRANSCRIBER_FUNCTION_NAME: voiceTranscriberLambda.functionName,
    POLLY_VOICE_ID: process.env.POLLY_VOICE_ID || 'Kajal',
    POLLY_ENGINE: process.env.POLLY_ENGINE || 'neural',
    POLLY_OUTPUT_FORMAT: process.env.POLLY_OUTPUT_FORMAT || 'mp3',
    VOICE_MAX_DURATION_SECONDS: process.env.VOICE_MAX_DURATION_SECONDS || '30',
    VOICE_MAX_AUDIO_BYTES: process.env.VOICE_MAX_AUDIO_BYTES || '1048576',
  },
});

// Grant read permissions on all canonical tables to agent
for (const tbl of agentTables) {
  tbl.grantReadData(agentLambda);
}

// Grant the agent access only to its durable session prefix. Document uploads
// are handled by the authenticated ingestion path and are never visible here.
agentLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
    resources: [`${backend.storage.resources.bucket.bucketArn}/${agentSessionPrefix}*`],
  }),
);
agentLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['s3:ListBucket'],
    resources: [backend.storage.resources.bucket.bucketArn],
    conditions: { StringLike: { 's3:prefix': [`${agentSessionPrefix}*`] } },
  }),
);

voiceTranscriberLambda.grantInvoke(agentLambda);
agentLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['polly:SynthesizeSpeech', 'polly:DescribeVoices'],
  resources: ['*'],
}));

// Grant invoke permissions on finfine-code-executor
agentLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [`arn:aws:lambda:${agentStack.region}:${agentStack.account}:function:finfine-code-executor`],
  })
);

// Create Lambda Function URL with CORS
const agentFunctionUrl = agentLambda.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
  invokeMode: lambda.InvokeMode.BUFFERED,
  cors: {
    allowedOrigins,
    allowedMethods: [lambda.HttpMethod.ALL],
    allowedHeaders: ['*'],
  },
});

// 8. Add Custom Outputs to amplify_outputs.json
backend.addOutput({
  custom: {
    ingestionStateMachineArn: ingestionStateMachine.stateMachineArn,
    documentExtractorLambdaArn: backend.documentExtractor.resources.lambda.functionArn,
    ingestionNormalizerLambdaArn: backend.ingestionNormalizer.resources.lambda.functionArn,
    agentApiUrl: agentFunctionUrl.url,
    agentFunctionArn: agentLambda.functionArn,
    voiceTranscriberFunctionName: voiceTranscriberLambda.functionName,
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
    merchantOnboardingTableName: onboardingTable.tableName,
    merchantFieldConfirmationTableName: fieldConfirmationTable.tableName,
    expectedReceivableTableName: expectedReceivableTable.tableName,
    inventorySnapshotTableName: inventorySnapshotTable.tableName,
    inventoryItemTableName: inventoryItemTable.tableName,
    purchaseOrderTableName: purchaseOrderTable.tableName,
    purchaseOrderLineItemTableName: purchaseOrderLineItemTable.tableName,
    agentSessionBucketName: backend.storage.resources.bucket.bucketName,
    agentSessionPrefix,
    agentSessionRetentionDays,
    statutoryAdvisoryCronLambdaArn: backend.statutoryAdvisoryCron.resources.lambda.functionArn,
    statutoryAdvisoryTableName: 'StatutoryAdvisory-ifsueqzwybf6nau7duulv5qweq-NONE',
  },
});
