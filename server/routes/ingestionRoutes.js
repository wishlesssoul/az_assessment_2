import { randomUUID } from 'crypto';
import { Router } from 'express';

import { processIngestion, recordRejectedPayload } from '../services/eventService.js';
import { processImportedRecords } from '../services/batchIngestionService.js';
import { parseImportFile } from '../services/fileImportService.js';
import { validateStudyPayload } from '../services/validationService.js';

const router = Router();

router.post('/', (req, res) => {
  const payload = req.body || {};
  const validation = validateStudyPayload(payload);

  if (!validation.valid) {
    const rejected = recordRejectedPayload(payload, validation.errors, {
      source: payload.source || 'regional_csv'
    });
    return res.status(422).json({
      message: 'Validation failed',
      errors: validation.errors,
      normalized: validation.normalized,
      dlqId: rejected.dlq.id,
      eventId: rejected.event.id
    });
  }

  const result = processIngestion(validation.normalized, {
    idempotencyKey: req.get('Idempotency-Key') || null
  });
  if (result.conflict) {
    return res.status(409).json({ message: 'Idempotency-Key was already used with a different payload.' });
  }

  return res.status(result.duplicate ? 200 : 201).json({
    study: result.canonical,
    event: result.event,
    duplicate: result.duplicate
  });
});

router.post('/import', (req, res) => {
  const { fileName = 'upload', format, content } = req.body || {};
  let records;
  try {
    records = parseImportFile({ format, content });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const batchId = req.get('Idempotency-Key') || `batch_${randomUUID()}`;
  return res.status(200).json(processImportedRecords(records, { fileName, batchId }));
});

export default router;
