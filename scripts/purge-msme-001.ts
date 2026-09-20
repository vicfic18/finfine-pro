import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const TENANT_ID = 'msme-001';
const EXECUTE = process.argv.includes('--execute');
const outputs = JSON.parse(readFileSync(resolve('amplify_outputs.json'), 'utf8')) as {
  auth?: { aws_region?: string };
  storage?: { bucket_name?: string; aws_region?: string };
  custom?: Record<string, unknown>;
};
const region = outputs.storage?.aws_region || outputs.auth?.aws_region || process.env.AWS_REGION || 'ap-south-1';
const bucket = outputs.storage?.bucket_name;
const tableNames = [...new Set(Object.entries(outputs.custom || {})
  .filter(([key, value]) => key.endsWith('TableName') && typeof value === 'string')
  .map(([, value]) => value as string))];
const prefixes = [`tenants/${TENANT_ID}/`, `public/${TENANT_ID}/`, `uploads/${TENANT_ID}/`];
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });

async function recordsFor(tableName: string) {
  const records: Array<Record<string, unknown>> = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await dynamo.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: { ':tenantId': TENANT_ID },
      ExclusiveStartKey: startKey,
    }));
    records.push(...(page.Items || []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return records;
}

async function objectKeys(prefix: string) {
  if (!bucket) return [];
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    keys.push(...(page.Contents || []).flatMap((item) => item.Key ? [item.Key] : []));
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

async function main() {
  const tableRecords = new Map<string, Array<Record<string, unknown>>>();
  for (const tableName of tableNames) tableRecords.set(tableName, await recordsFor(tableName));
  const objects = new Map<string, string[]>();
  for (const prefix of prefixes) objects.set(prefix, await objectKeys(prefix));

  console.log(JSON.stringify({
    mode: EXECUTE ? 'execute' : 'preview',
    tenantId: TENANT_ID,
    tables: [...tableRecords].map(([tableName, records]) => ({ tableName, count: records.length })),
    s3: [...objects].map(([prefix, keys]) => ({ prefix, count: keys.length })),
  }, null, 2));
  if (!EXECUTE) return;

  for (const [tableName, records] of tableRecords) {
    for (let index = 0; index < records.length; index += 25) {
      const deletes = records.slice(index, index + 25).flatMap((record) => record.id ? [{ DeleteRequest: { Key: { id: record.id } } }] : []);
      if (deletes.length) await dynamo.send(new BatchWriteCommand({ RequestItems: { [tableName]: deletes } }));
    }
  }
  if (bucket) {
    for (const keys of objects.values()) {
      for (let index = 0; index < keys.length; index += 1000) {
        const batch = keys.slice(index, index + 1000);
        if (batch.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })) } }));
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
