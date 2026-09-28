import test from 'node:test';
import assert from 'node:assert/strict';

import { processIngestion } from './eventService.js';
import { getDiffSince, getStudyById, verifyEventChain } from '../data/store.js';

test('ingestion materializes canonical data once for a repeated idempotency key', () => {
  const payload = {
    studyId: 'NCT-IDEMPOTENT-1',
    title: 'Idempotency Check Study',
    status: 'Active',
    phase: 'Phase II',
    targetEnrollment: 120,
    source: 'test'
  };

  const first = processIngestion(payload, { idempotencyKey: 'test-idempotency-1' });
  const second = processIngestion(payload, { idempotencyKey: 'test-idempotency-1' });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.event.id, second.event.id);
  assert.equal(getStudyById(payload.studyId).title, payload.title);
  assert.equal(verifyEventChain().valid, true);
});

test('event diff returns the append-only event created by ingestion', () => {
  const result = processIngestion({
    studyId: 'NCT-DIFF-1',
    title: 'Event Diff Study',
    status: 'Recruiting',
    targetEnrollment: 50,
    source: 'test'
  });
  const events = getDiffSince(result.event.timestamp);

  assert.ok(events.some((event) => event.id === result.event.id));
  assert.equal(result.event.sequence > 0, true);
  assert.equal(typeof result.event.hash, 'string');
});

test('idempotency key reuse with a different payload is rejected as a conflict', () => {
  const payload = {
    studyId: 'NCT-IDEMPOTENCY-CONFLICT',
    title: 'Original Study Title',
    status: 'Active',
    targetEnrollment: 30
  };
  processIngestion(payload, { idempotencyKey: 'test-idempotency-conflict' });
  const conflict = processIngestion({ ...payload, title: 'Changed Study Title' }, {
    idempotencyKey: 'test-idempotency-conflict'
  });

  assert.equal(conflict.conflict, true);
  assert.equal(getStudyById(payload.studyId).title, payload.title);
});
