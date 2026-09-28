import test from 'node:test';
import assert from 'node:assert/strict';

import { listDlq, verifyEventChain } from '../data/store.js';
import { processImportedRecords } from './batchIngestionService.js';

test('batch ingestion ingests valid rows and routes invalid rows to the DLQ', () => {
  const initialDlqCount = listDlq().length;
  const result = processImportedRecords([
    {
      study_id: 'NCT-BATCH-VALID',
      title: 'Valid Batch Trial',
      study_status: 'Recruiting',
      target_enrollment: '45'
    },
    {
      study_id: 'NCT-BATCH-INVALID',
      title: 'Invalid Batch Trial',
      study_status: 'Active',
      target_enrollment: 'unknown'
    }
  ], { fileName: 'test.csv', batchId: 'batch-test-1' });

  assert.equal(result.total, 2);
  assert.equal(result.ingested, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.results[0].status, 'ingested');
  assert.equal(result.results[1].status, 'rejected');
  assert.equal(listDlq().length, initialDlqCount + 1);
  assert.equal(verifyEventChain().valid, true);
});
