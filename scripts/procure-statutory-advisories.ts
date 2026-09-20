/**
 * Script to procure and seed statutory legislation acts and advisory records into DynamoDB.
 * 
 * Usage:
 *   npx tsx scripts/procure-statutory-advisories.ts
 */

import {
  ensureStatutoryAdvisoryTable,
  syncStatutoryAdvisoriesToDynamoDB,
  getLatestStatutoryAdvisory,
  STATUTORY_ADVISORY_TABLE_NAME,
} from '../src/lib/statutory-cron-service';

async function main() {
  console.log('================================================================');
  console.log('🇮🇳 FinFine Pro - Procuring Statutory Legislation & Regulatory Feed');
  console.log(`Table: ${STATUTORY_ADVISORY_TABLE_NAME}`);
  console.log('================================================================\n');

  console.log('1. Ensuring DynamoDB table exists...');
  await ensureStatutoryAdvisoryTable();

  console.log('\n2. Syncing statutory acts (Vaquill AI / Indian Kanoon / Official Gazette)...');
  const syncRes = await syncStatutoryAdvisoriesToDynamoDB();
  console.log(`✓ Seeded ${syncRes.count} statutory acts into DynamoDB.`);

  console.log('\n3. Testing sector regex matching for "Retail & Distribution"...');
  const retailAdvisory = await getLatestStatutoryAdvisory('Retail & Distribution');
  console.log(`✓ Generated ${retailAdvisory.recommendations.length} sector-matched recommendations:`);
  retailAdvisory.recommendations.forEach((r, idx) => {
    console.log(`   ${idx + 1}. [${r.urgency}] ${r.title} (${r.tag})`);
    console.log(`      Advice: ${r.advice}`);
  });

  console.log('\n4. Testing sector regex matching for "Jewelry & Wedding Apparel"...');
  const jewelryAdvisory = await getLatestStatutoryAdvisory('Jewelry & Wedding Apparel');
  console.log(`✓ Generated ${jewelryAdvisory.recommendations.length} sector-matched recommendations:`);
  jewelryAdvisory.recommendations.forEach((r, idx) => {
    console.log(`   ${idx + 1}. [${r.urgency}] ${r.title} (${r.tag})`);
  });

  console.log('\n✓ Statutory advisory procurement and DynamoDB seeding complete!');
}

main().catch((err) => {
  console.error('Failed to procure statutory advisories:', err);
  process.exit(1);
});
