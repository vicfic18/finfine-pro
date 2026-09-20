/**
 * Indian Statutory Tax & Market Intelligence Procurement Script
 * 
 * Sources and seeds authoritative compliance calendars, statutory deadlines,
 * legal penal clauses, and festive demand cycles into AWS DynamoDB.
 * 
 * Usage:
 *   npx tsx scripts/procure-tax-rules.ts
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  AUTHORITATIVE_TAX_RULES_CATALOG,
  AUTHORITATIVE_MARKET_EVENTS_CATALOG,
} from '../src/lib/tax-rules-engine';

const region = process.env.AWS_REGION || 'ap-south-1';
const taxRuleTable = process.env.TAX_COMPLIANCE_RULE_TABLE_NAME || 'TaxComplianceRule-ifsueqzwybf6nau7duulv5qweq-NONE';
const marketEventTable = process.env.MARKET_CALENDAR_EVENT_TABLE_NAME || 'MarketCalendarEvent-ifsueqzwybf6nau7duulv5qweq-NONE';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function ensureTable(tableName: string) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`✓ Table ready: ${tableName}`);
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      console.log(`Creating DynamoDB table ${tableName}...`);
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST',
        })
      );
      console.log(`✓ Table created: ${tableName}`);
    } else {
      throw err;
    }
  }
}

export async function procureTaxRulesAndCalendarEvents() {
  console.log('================================================================');
  console.log('🇮🇳 Procuring Authoritative Indian Tax & Market Intelligence...');
  console.log(`Region: ${region}`);
  console.log('================================================================\n');

  await ensureTable(taxRuleTable);
  await ensureTable(marketEventTable);

  // 1. Seed Tax Compliance Rules
  console.log(`\nProcuring ${AUTHORITATIVE_TAX_RULES_CATALOG.length} statutory tax compliance rules...`);
  let rulesSeeded = 0;
  for (const rule of AUTHORITATIVE_TAX_RULES_CATALOG) {
    await docClient.send(
      new PutCommand({
        TableName: taxRuleTable,
        Item: {
          ...rule,
          updatedAt: new Date().toISOString(),
        },
      })
    );
    console.log(`  + [${rule.category}] ${rule.title} (${rule.form}) -> Due Day: ${rule.dueDay}`);
    rulesSeeded++;
  }

  // 2. Seed Market Calendar Events
  console.log(`\nProcuring ${AUTHORITATIVE_MARKET_EVENTS_CATALOG.length} Indian market festival & demand events...`);
  let eventsSeeded = 0;
  for (const event of AUTHORITATIVE_MARKET_EVENTS_CATALOG) {
    await docClient.send(
      new PutCommand({
        TableName: marketEventTable,
        Item: {
          ...event,
          updatedAt: new Date().toISOString(),
        },
      })
    );
    console.log(`  + [${event.category}] ${event.name} (${event.startDate} to ${event.endDate}) -> Inflow Multiplier: ${event.inflowMultiplier}x`);
    eventsSeeded++;
  }

  console.log('\n================================================================');
  console.log(`✓ Successfully procured and stored in DynamoDB:`);
  console.log(`  • ${rulesSeeded} Statutory Tax Rules`);
  console.log(`  • ${eventsSeeded} Market Demand Events`);
  console.log('================================================================\n');

  return { rulesSeeded, eventsSeeded };
}

// Direct execution
if (require.main === module || process.argv[1]?.endsWith('procure-tax-rules.ts')) {
  procureTaxRulesAndCalendarEvents()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Procurement error:', err);
      process.exit(1);
    });
}
