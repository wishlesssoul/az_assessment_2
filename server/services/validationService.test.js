import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStudyPayload } from './validationService.js';
import { inferSchemaProposal } from './aiSchemaService.js';

test('validation accepts a canonical clinical study payload', () => {
  const result = validateStudyPayload({
    study_id: 'NCT-2047',
    title: 'Precision Oncology Trial',
    study_status: 'Active',
    phase: 'Phase II',
    target_enrollment: 180,
    source: 'clinicaltrials',
    country: 'United States'
  });

  assert.equal(result.valid, true);
  assert.equal(result.normalized.studyId, 'NCT-2047');
  assert.equal(result.normalized.targetEnrollment, 180);
});

test('schema inference proposes mapping for an unknown source shape', () => {
  const proposal = inferSchemaProposal({
    sourceid: 'CTR-881',
    protocol_name: 'Cardiac Biomarker Cohort',
    study_state: 'Recruiting',
    study_stage: 'Phase III',
    planned_participants: '450'
  });

  assert.ok(proposal.confidenceScore >= 85);
  assert.equal(proposal.requiresHumanApproval, false);
  assert.ok(proposal.policyEvidence.length > 0);
});

test('validation rejects non-integer enrollment with structured error details', () => {
  const result = validateStudyPayload({
    studyId: 'NCT-1234',
    title: 'Enrollment Validation Study',
    status: 'Recruiting',
    targetEnrollment: '12.5'
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.loc[0] === 'targetEnrollment'));
});

test('validation rejects non-object payloads without throwing', () => {
  const result = validateStudyPayload([]);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].type, 'object_type');
});

test('validation requires target enrollment rather than silently defaulting it to zero', () => {
  const result = validateStudyPayload({ studyId: 'NCT-NO-ENROLLMENT', title: 'Missing Enrollment', status: 'Active' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.loc[0] === 'targetEnrollment'));
});

test('schema inference escalates an unparseable enrollment value', () => {
  const proposal = inferSchemaProposal({
    study_id: 'NCT-AMBIGUOUS',
    title: 'Ambiguous Enrollment Trial',
    status: 'Active',
    target_enrollment: 'TBD'
  });

  assert.equal(proposal.confidenceScore, 60);
  assert.equal(proposal.requiresHumanApproval, true);
  assert.equal(proposal.proposedMapping.targetEnrollment, null);
});
