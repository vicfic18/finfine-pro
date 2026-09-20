import type { EventBridgeHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.STATUTORY_ADVISORY_TABLE_NAME || 'StatutoryAdvisory-ifsueqzwybf6nau7duulv5qweq-NONE';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * AWS EventBridge Scheduled Cron Handler for Statutory Intelligence & Regulatory Updates
 * Runs on periodic schedule (e.g. daily) to pull latest statutory legislation and store in DynamoDB
 */
export const handler: EventBridgeHandler<'Scheduled Event', void, void> = async (event) => {
  console.log('[AWS EventBridge Cron] Statutory Advisory Cron triggered at:', new Date().toISOString());
  console.log('[AWS EventBridge Cron] Event Details:', JSON.stringify(event));

  try {
    // Dynamic import to prevent cold-start bundling weight if needed
    const { executeStatutoryCronSync } = await import('../../../src/lib/statutory-cron-service');
    const result = await executeStatutoryCronSync({ triggerSource: 'AWS_EVENTBRIDGE_CRON' });
    console.log('[AWS EventBridge Cron] Statutory Intelligence sync succeeded:', {
      timestamp: result.timestamp,
      count: result.activeStatutoryUpdates.length,
    });
  } catch (err: any) {
    console.error('[AWS EventBridge Cron] Error executing statutory advisory cron:', err);
    throw err;
  }
};
