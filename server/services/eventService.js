import {
  addEvent,
  getIdempotentResult,
  pushDlq,
  saveIdempotentResult,
  upsertStudy
} from '../data/store.js';
import crypto from 'crypto';

export function processIngestion(rawPayload = {}, { idempotencyKey = null, actor = 'ingestion_api' } = {}) {
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex');
  const existing = getIdempotentResult(idempotencyKey, fingerprint);
  if (existing) return existing;

  const canonical = {
    studyId: rawPayload.studyId,
    title: rawPayload.title,
    status: rawPayload.status,
    phase: rawPayload.phase || 'Unknown',
    targetEnrollment: rawPayload.targetEnrollment ?? 0,
    country: rawPayload.country || 'Unknown',
    source: rawPayload.source || 'regional_csv'
  };

  const event = addEvent({
    entity: canonical.studyId || 'unknown-study',
    eventType: 'study_ingested',
    source: canonical.source,
    actor,
    correlationId: idempotencyKey,
    payload: { raw: rawPayload, canonical }
  });

  const materialized = upsertStudy(canonical);
  const result = {
    event,
    canonical: materialized,
    duplicate: false
  };
  saveIdempotentResult(idempotencyKey, result, fingerprint);
  return result;
}

export function recordRejectedPayload(rawPayload, errors, {
  source = 'regional_csv',
  actor = 'ingestion_api',
  fileName = null,
  rowNumber = null,
  correlationId = null
} = {}) {
  const event = addEvent({
    entity: rawPayload?.study_id || rawPayload?.studyId || rawPayload?.nct_id || 'unknown-study',
    eventType: 'ingestion_rejected',
    source,
    actor,
    correlationId,
    payload: { raw: rawPayload, errors, fileName, rowNumber }
  });
  const dlq = pushDlq({
    component: 'schema_validation',
    event: 'VALIDATION_FAILURE',
    source,
    raw_payload: rawPayload,
    error_surface: errors,
    eventId: event.id,
    fileName,
    rowNumber,
    status: 'open'
  });
  return { event, dlq };
}
