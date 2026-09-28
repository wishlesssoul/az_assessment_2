import test from 'node:test';
import assert from 'node:assert/strict';

import { seedDemoData } from './seedData.js';
import { listAiProposals, listDlq, listEvents, listStudies, verifyEventChain } from './store.js';

test('startup seed populates canonical, proposal, DLQ, and ledger workflows once', () => {
  const result = seedDemoData();

  assert.equal(result.seeded, true);
  assert.ok(listStudies().length >= 4);
  assert.ok(listAiProposals().some((proposal) => proposal.status === 'pending_review'));
  assert.ok(listAiProposals().some((proposal) => proposal.status === 'approved'));
  assert.ok(listAiProposals().some((proposal) => proposal.status === 'rejected'));
  assert.ok(listDlq().some((entry) => entry.status === 'open'));
  assert.ok(listEvents(100).length > 0);
  assert.equal(verifyEventChain().valid, true);
  assert.equal(seedDemoData().seeded, false);
});
