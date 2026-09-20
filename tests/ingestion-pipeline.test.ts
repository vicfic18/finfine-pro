import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFromDocumentText } from '../amplify/functions/document-extractor/handler';
import { normalizeAmount, normalizeDate, validateExtraction } from '../amplify/functions/ingestion-normalizer/handler';

test('deterministic extraction preserves facts and provenance without defaults', () => {
  const result = extractFromDocumentText(
    [
      'BANK STATEMENT',
      'Statement Period: 01/01/2026 to 31/03/2026',
      'Opening Balance: INR 100.00',
      '01/01/2026 UPI/CR ACME 500.00 CR 600.00',
      'Closing Balance: INR 600.00',
    ].join('\n'),
    { purpose: 'BANK_ACTIVITY', category: 'BANK_ACTIVITY' },
  );
  assert.equal(result.openingBalance, 100);
  assert.equal(result.closingBalance, 600);
  assert.equal(result.transactions[0]?.amount, 500);
  assert.equal(result.transactions[0]?.provenance?.row, 4);
  assert.equal(result.transactions[0]?.date, '2026-01-01');
  assert.equal(result.transactions[0]?.counterpartyName, undefined);
});

test('unknown documents do not receive fabricated amounts, dates, or counterparties', () => {
  const result = extractFromDocumentText('A document with no financial facts');
  assert.equal(result.documentType, 'OTHER');
  assert.equal(result.obligations.length, 0);
  assert.equal(result.openingBalance, undefined);
  assert.ok(result.validationIssues?.includes('UNRECOGNIZED_DOCUMENT'));
});

test('normalization rejects invalid dates and amounts instead of substituting now', () => {
  assert.equal(normalizeDate('not a date'), undefined);
  assert.equal(normalizeAmount('not a number'), undefined);
  assert.deepEqual(validateExtraction({ documentType: 'BANK_STATEMENT', transactions: [], obligations: [], currency: 'INR' }, 'BANK_ACTIVITY'), ['MISSING_REPORTING_PERIOD']);
});
