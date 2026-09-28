import test from 'node:test';
import assert from 'node:assert/strict';

import { parseImportFile } from './fileImportService.js';

test('CSV import handles headers, quoted commas, and whitespace', () => {
  const records = parseImportFile({
    format: 'csv',
    content: 'study_id,title,status,phase,target_enrollment,country\nNCT-CSV-1,"Trial, With Comma",Recruiting,Phase II,120,Canada\n'
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'Trial, With Comma');
  assert.equal(records[0].target_enrollment, '120');
});

test('JSON import accepts an array or a records envelope', () => {
  const records = parseImportFile({ format: '.json', content: JSON.stringify({ records: [{ study_id: 'NCT-JSON-1' }] }) });
  assert.equal(records.length, 1);
  assert.equal(records[0].study_id, 'NCT-JSON-1');
});

test('unsupported and malformed uploads return useful errors', () => {
  assert.throws(() => parseImportFile({ format: 'xml', content: '<records/>' }), /Unsupported file format/);
  assert.throws(() => parseImportFile({ format: 'json', content: '{broken' }), /Invalid JSON/);
});
