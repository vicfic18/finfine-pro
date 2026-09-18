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

docTable.grantReadWriteData(backend.ingestionNormalizer.resources.lambda);
txnTable.grantReadWriteData(backend.ingestionNormalizer.resources.lambda);
oblTable.grantReadWriteData(backend.ingestionNormalizer.resources.lambda);

const normalizerLambda = backend.ingestionNormalizer.resources.lambda as lambda.Function;
normalizerLambda.addEnvironment('DOCUMENT_RECORD_TABLE_NAME', docTable.tableName);
normalizerLambda.addEnvironment('TRANSACTION_TABLE_NAME', txnTable.tableName);
normalizerLambda.addEnvironment('OBLIGATION_TABLE_NAME', oblTable.tableName);

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
  },
});
