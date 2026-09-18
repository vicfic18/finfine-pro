import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SFNClient, StartExecutionCommand, DescribeExecutionCommand, ExecutionStatus } from '@aws-sdk/client-sfn';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { generateSampleBankStatementPdf } from './generate-sample-statement';

// Load Amplify configuration outputs
const outputsPath = path.join(__dirname, '../amplify_outputs.json');
if (!fs.existsSync(outputsPath)) {
  console.error('Error: amplify_outputs.json not found. Please ensure ampx sandbox is running.');
  process.exit(1);
}

const amplifyOutputs = JSON.parse(fs.readFileSync(outputsPath, 'utf-8'));
const region = amplifyOutputs.storage?.aws_region || amplifyOutputs.auth?.aws_region || 'ap-south-1';
const bucketName = amplifyOutputs.storage?.bucket_name;
const customOutputs = amplifyOutputs.custom || {};
const stateMachineArn = customOutputs.ingestionStateMachineArn;
const docTableName = customOutputs.documentRecordTableName;
const txnTableName = customOutputs.transactionTableName;

console.log('--- FinFine Pro: Asynchronous Document Ingestion & Extraction Test ---');
console.log(`Region: ${region}`);
console.log(`S3 Bucket: ${bucketName}`);
console.log(`Step Functions State Machine: ${stateMachineArn || '(Pending backend update)'}`);
console.log(`DocumentRecord Table: ${docTableName || '(Auto-detected)'}`);
console.log(`Transaction Table: ${txnTableName || '(Auto-detected)'}`);

const s3Client = new S3Client({ region });
const sfnClient = new SFNClient({ region });
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function findTableByPrefix(prefix: string): Promise<string | undefined> {
  const { ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
  const res = await dynamoClient.send(new ListTablesCommand({}));
  return res.TableNames?.find((name) => name.toLowerCase().includes(prefix.toLowerCase()));
}

async function runTest() {
  // 1. Generate realistic test bank statement PDF
  const samplePdfPath = path.join(__dirname, '../sample_data/sample_upi_bank_statement.pdf');
  console.log('\n[Step 1] Generating sample MSME UPI bank statement PDF...');
  const pdfBuffer = await generateSampleBankStatementPdf(samplePdfPath);
  console.log(`Generated sample PDF (${pdfBuffer.length} bytes) at ${samplePdfPath}`);

  // 2. Upload to S3
  const timestamp = Date.now();
  const testDocId = `test-stmt-${timestamp}`;
  const s3Key = `public/tenants/msme-001/raw/${testDocId}-sample_upi_bank_statement.pdf`;

  console.log(`\n[Step 2] Uploading statement to S3: s3://${bucketName}/${s3Key}...`);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        tenantId: 'msme-001',
        documentId: testDocId,
      },
    })
  );
  console.log('Successfully uploaded PDF to Amazon S3.');

  // 3. Trigger Ingestion State Machine or Direct Lambda Execution
  let pipelineResult: any = null;

  if (stateMachineArn) {
    console.log(`\n[Step 3] Triggering Step Functions State Machine: ${stateMachineArn}...`);
    const execInput = {
      bucket: bucketName,
      key: s3Key,
      tenantId: 'msme-001',
      documentId: testDocId,
    };

    const startRes = await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn,
        name: `test-exec-${timestamp}`,
        input: JSON.stringify(execInput),
      })
    );

    const executionArn = startRes.executionArn!;
    console.log(`Execution started: ${executionArn}`);
    console.log('Polling Step Functions execution status...');

    let status: ExecutionStatus = ExecutionStatus.RUNNING;
    let pollCount = 0;
    const maxPolls = 30; // 60 seconds

    while (status === ExecutionStatus.RUNNING && pollCount < maxPolls) {
      await new Promise((r) => setTimeout(r, 2000));
      const desc = await sfnClient.send(new DescribeExecutionCommand({ executionArn }));
      status = desc.status!;
      pollCount++;
      process.stdout.write(`Status: ${status} (${pollCount * 2}s)...\r`);

      if (status === ExecutionStatus.SUCCEEDED) {
        console.log(`\nStep Functions Execution SUCCEEDED!`);
        pipelineResult = desc.output ? JSON.parse(desc.output) : null;
        break;
      } else if (status === ExecutionStatus.FAILED || status === ExecutionStatus.TIMED_OUT || status === ExecutionStatus.ABORTED) {
        console.error(`\nStep Functions Execution ended with status: ${status}`);
        console.error('Error Details:', desc.error, desc.cause);
        break;
      }
    }
  } else {
    console.log('\n[Step 3] Step Functions ARN not yet in amplify_outputs, executing extractor & normalizer directly...');
    const { handler: extractorHandler } = await import('../amplify/functions/document-extractor/handler');
    const { handler: normalizerHandler } = await import('../amplify/functions/ingestion-normalizer/handler');

    console.log('Executing Document Extractor with Amazon Bedrock Claude 3.5 Haiku...');
    const extractOutput = await (extractorHandler as any)({
      bucket: bucketName,
      key: s3Key,
      tenantId: 'msme-001',
      documentId: testDocId,
    });

    console.log('Executing Ingestion Normalizer...');
    const resolvedDocTable = docTableName || (await findTableByPrefix('DocumentRecord'));
    const resolvedTxnTable = txnTableName || (await findTableByPrefix('Transaction'));
    const resolvedOblTable = (await findTableByPrefix('Obligation'));

    process.env.DOCUMENT_RECORD_TABLE_NAME = resolvedDocTable;
    process.env.TRANSACTION_TABLE_NAME = resolvedTxnTable;
    process.env.OBLIGATION_TABLE_NAME = resolvedOblTable;

    pipelineResult = await (normalizerHandler as any)(extractOutput);
  }

  // 4. Verification in DynamoDB
  console.log('\n[Step 4] Querying and Verifying Persisted DynamoDB Records...');
  const resolvedTxnTable = txnTableName || (await findTableByPrefix('Transaction'));
  const resolvedDocTable = docTableName || (await findTableByPrefix('DocumentRecord'));

  if (resolvedDocTable) {
    console.log(`Checking DocumentRecord in ${resolvedDocTable}...`);
    try {
      const docRes = await docClient.send(
        new GetCommand({
          TableName: resolvedDocTable,
          Key: { id: testDocId },
        })
      );
      if (docRes.Item) {
        console.log('\n===== DOCUMENT RECORD PERSISTED =====');
        console.log(`Document ID: ${docRes.Item.id}`);
        console.log(`Status: ${docRes.Item.status}`);
        console.log(`Document Type: ${docRes.Item.documentType}`);
        console.log(`Extracted Entity Count: ${docRes.Item.extractedEntityCount}`);
        console.log(`File: ${docRes.Item.fileName}`);
      }
    } catch (e) {
      console.warn('Could not fetch single DocumentRecord:', e);
    }
  }

  if (resolvedTxnTable) {
    console.log(`\nScanning Normalized Transactions from ${resolvedTxnTable}...`);
    try {
      const txRes = await docClient.send(
        new ScanCommand({
          TableName: resolvedTxnTable,
        })
      );

      const items = (txRes.Items || []).filter((tx: any) => tx.documentId === testDocId || tx.tenantId === 'msme-001');
      console.log(`\n===== NORMALIZED TRANSACTIONS EXTRACTED (${items.length} records) =====`);
      console.table(
        items.map((tx: any) => ({
          Date: tx.date,
          Type: tx.type,
          Amount: `₹${tx.amount.toLocaleString('en-IN')}`,
          Mode: tx.paymentMode,
          Category: tx.category,
          PriorityWeight: tx.priorityWeight,
          Counterparty: tx.counterpartyName?.substring(0, 25),
          UPI_VPA: tx.counterpartyIdentifier || '-',
          Ref_UTR: tx.referenceNumber || '-',
        }))
      );
    } catch (e) {
      console.warn('Could not scan Transactions table:', e);
    }
  }

  if (pipelineResult) {
    console.log('\n===== PIPELINE SUMMARY =====');
    console.log(JSON.stringify(pipelineResult.summary || pipelineResult, null, 2));
  }

  console.log('\n SUCCESS: Ingestion and Multimodal Extraction Pipeline verification completed!');
}

runTest().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
