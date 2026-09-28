const REQUIRED_FIELDS = ['studyId', 'title', 'status', 'targetEnrollment'];
const VALID_STATUSES = new Set(['active', 'completed', 'recruiting', 'withdrawn', 'unknown']);

function firstPresent(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

export function validateStudyPayload(rawPayload = {}) {
  const errors = [];
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return {
      valid: false,
      normalized: {},
      errors: [{ loc: [], msg: 'Payload must be a JSON object', type: 'object_type' }]
    };
  }

  const rawEnrollment = firstPresent(rawPayload, [
    'target_enrollment', 'targetEnrollment', 'enrollment', 'planned_participants', 'participants'
  ]);
  const parsedEnrollment = rawEnrollment === null ? 0 : Number(rawEnrollment);
  const rawStatus = firstPresent(rawPayload, ['study_status', 'status', 'study_state']);
  const normalizedStatus = rawStatus ? String(rawStatus).trim().toLowerCase() : null;
  const normalized = {
    studyId: firstPresent(rawPayload, ['study_id', 'nct_id', 'studyId', 'sourceid', 'protocol_id']),
    title: firstPresent(rawPayload, ['title', 'study_title', 'name', 'protocol_name']),
    status: normalizedStatus && VALID_STATUSES.has(normalizedStatus)
      ? normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)
      : rawStatus ? 'Unknown' : null,
    phase: firstPresent(rawPayload, ['phase', 'study_phase', 'study_stage']) || 'Unknown',
    targetEnrollment: rawEnrollment === null ? null : parsedEnrollment,
    source: firstPresent(rawPayload, ['source']) || 'regional_csv',
    country: firstPresent(rawPayload, ['country', 'location_country']) || 'Unknown'
  };

  for (const field of REQUIRED_FIELDS) {
    if (normalized[field] === null || normalized[field] === undefined || (typeof normalized[field] === 'string' && normalized[field].trim() === '')) {
      errors.push({
        loc: [field],
        msg: `Field '${field}' is required`,
        type: 'missing_required_field'
      });
    }
  }

  if (rawEnrollment !== null && (!Number.isFinite(parsedEnrollment) || !Number.isInteger(parsedEnrollment) || parsedEnrollment < 0)) {
    errors.push({
      loc: ['targetEnrollment'],
      msg: 'Target enrollment must be a non-negative integer',
      type: 'integer_range'
    });
  }

  if (normalized.studyId && String(normalized.studyId).length > 120) {
    errors.push({ loc: ['studyId'], msg: 'Study identifier must be 120 characters or fewer', type: 'string_too_long' });
  }

  if (normalized.title && String(normalized.title).length > 1000) {
    errors.push({ loc: ['title'], msg: 'Study title must be 1000 characters or fewer', type: 'string_too_long' });
  }

  if (!normalized.status && !errors.some((error) => error.loc[0] === 'status')) {
    errors.push({ loc: ['status'], msg: "Field 'status' is required", type: 'missing_required_field' });
  }

  return {
    valid: errors.length === 0,
    normalized,
    errors
  };
}
