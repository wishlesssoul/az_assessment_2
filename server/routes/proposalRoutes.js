import { Router } from 'express';

import { validateStudyPayload } from '../services/validationService.js';
import { inferSchemaProposal } from '../services/aiSchemaService.js';
import { processIngestion } from '../services/eventService.js';
import { paginate, sortNewestFirst } from '../services/paginationService.js';
import {
  addEvent,
  createAiProposal,
  decideAiProposal,
  getAiProposal,
  listAiProposals
} from '../data/store.js';

const router = Router();

router.get('/', (req, res) => {
  const result = paginate(sortNewestFirst(listAiProposals(), 'createdAt'), req.query.page, req.query.pageSize);
  res.json({ proposals: result.items, pagination: result.pagination });
});

router.post('/', (req, res) => {
  const rawPayload = req.body || {};
  const proposal = createAiProposal({ ...inferSchemaProposal(rawPayload), rawPayload });
  addEvent({
    entity: proposal.proposedMapping.studyId || 'unknown-study',
    eventType: 'ai_schema_proposed',
    source: rawPayload.source || 'unknown',
    actor: 'schema_inference_service',
    payload: { proposalId: proposal.id, confidenceScore: proposal.confidenceScore }
  });
  res.status(201).json({ proposal });
});

router.post('/:id/approve', (req, res) => {
  const proposal = getAiProposal(req.params.id);
  if (!proposal || proposal.status !== 'pending_review') {
    return res.status(404).json({ message: 'Proposal not found.' });
  }

  const validation = validateStudyPayload(req.body?.mapping || proposal.proposedMapping);
  if (!validation.valid) {
    return res.status(422).json({ message: 'Proposed mapping is invalid', errors: validation.errors });
  }

  const actor = req.body?.actor || 'data_steward';
  const decided = decideAiProposal(proposal.id, 'approved', actor, req.body?.notes || '', validation.normalized);
  const result = processIngestion(validation.normalized, {
    idempotencyKey: `proposal:${proposal.id}`,
    actor
  });
  addEvent({
    entity: validation.normalized.studyId,
    eventType: 'ai_mapping_approved',
    source: proposal.rawPayload?.source || 'unknown',
    actor,
    correlationId: proposal.id,
    payload: { proposalId: proposal.id, notes: req.body?.notes || '' }
  });
  return res.json({ proposal: decided, study: result.canonical, event: result.event });
});

router.post('/:id/reject', (req, res) => {
  const proposal = getAiProposal(req.params.id);
  if (!proposal || proposal.status !== 'pending_review') {
    return res.status(404).json({ message: 'Pending proposal not found.' });
  }
  const actor = req.body?.actor || 'data_steward';
  const rejected = decideAiProposal(proposal.id, 'rejected', actor, req.body?.notes || '');
  addEvent({
    entity: proposal.proposedMapping.studyId || 'unknown-study',
    eventType: 'ai_mapping_rejected',
    source: proposal.rawPayload?.source || 'unknown',
    actor,
    correlationId: proposal.id,
    payload: { proposalId: proposal.id, notes: req.body?.notes || '' }
  });
  return res.json({ proposal: rejected });
});

export default router;
