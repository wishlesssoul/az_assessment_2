import { addEvent } from '../data/store.js';
import { processIngestion, recordRejectedPayload } from './eventService.js';
import { validateStudyPayload } from './validationService.js';

export function processImportedRecords(records, { fileName, batchId }) {
  addEvent({
    entity: batchId,
    eventType: 'file_import_started',
    source: 'file_import',
    actor: 'ingestion_api',
    correlationId: batchId,
    payload: { fileName, recordCount: records.length }
  });

  const results = records.map((record, index) => {
    const rowNumber = index + 1;
    const rawPayload = { ...record, source: record.source || 'file_import' };
    const validation = validateStudyPayload(rawPayload);

    if (!validation.valid) {
      const rejected = recordRejectedPayload(rawPayload, validation.errors, {
        source: rawPayload.source,
        actor: 'file_import',
        fileName,
        rowNumber,
        correlationId: batchId
      });
      return {
        rowNumber,
        status: 'rejected',
        errors: validation.errors,
        dlqId: rejected.dlq.id
      };
    }

    const ingestion = processIngestion(validation.normalized, {
      idempotencyKey: `${batchId}:${rowNumber}`,
      actor: 'file_import'
    });
    if (ingestion.conflict) {
      return { rowNumber, status: 'conflict', message: 'Batch id was already used with different row data.' };
    }
    return {
      rowNumber,
      status: ingestion.duplicate ? 'duplicate' : 'ingested',
      studyId: ingestion.canonical.studyId,
      eventId: ingestion.event.id
    };
  });

  const ingested = results.filter((result) => result.status === 'ingested' || result.status === 'duplicate').length;
  const rejected = results.filter((result) => result.status === 'rejected').length;
  const conflicts = results.filter((result) => result.status === 'conflict').length;
  addEvent({
    entity: batchId,
    eventType: 'file_import_completed',
    source: 'file_import',
    actor: 'ingestion_api',
    correlationId: batchId,
    payload: { fileName, total: records.length, ingested, rejected, conflicts }
  });

  return { batchId, fileName, total: records.length, ingested, rejected, conflicts, results };
}
