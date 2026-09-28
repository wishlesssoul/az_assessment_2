import { Router } from 'express';

import { processIngestion } from '../services/eventService.js';
import { paginate, sortNewestFirst } from '../services/paginationService.js';
import { addEvent, getDlqEntry, listDlq, resolveDlqEntry } from '../data/store.js';
import { validateStudyPayload } from '../services/validationService.js';

const router = Router();

router.get('/', (req, res) => {
  const result = paginate(sortNewestFirst(listDlq(), 'timestamp'), req.query.page, req.query.pageSize);
  res.json({ dlq: result.items, pagination: result.pagination });
});

router.post('/:id/replay', (req, res) => {
  const entry = getDlqEntry(req.params.id);
  if (!entry || entry.status !== 'open') {
    return res.status(404).json({ message: 'Open DLQ entry not found.' });
  }
  const validation = validateStudyPayload(req.body?.payload || entry.raw_payload);
  if (!validation.valid) {
    return res.status(422).json({ message: 'Payload still fails validation', errors: validation.errors });
  }

  const actor = req.body?.actor || 'data_steward';
  const result = processIngestion(validation.normalized, {
    idempotencyKey: `dlq-replay:${entry.id}`,
    actor
  });
  if (result.conflict) {
    return res.status(409).json({ message: 'DLQ replay conflicted with an earlier replay payload.' });
  }
  resolveDlqEntry(entry.id, 'replayed');
  addEvent({
    entity: validation.normalized.studyId,
    eventType: 'dlq_record_replayed',
    source: entry.source,
    actor,
    correlationId: entry.id,
    payload: { dlqId: entry.id }
  });
  return res.json({ study: result.canonical, event: result.event, dlqId: entry.id });
});

export default router;
