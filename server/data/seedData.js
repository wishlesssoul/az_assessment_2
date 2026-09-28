import { inferSchemaProposal } from '../services/aiSchemaService.js';
import { processIngestion, recordRejectedPayload } from '../services/eventService.js';
import { validateStudyPayload } from '../services/validationService.js';
import {
  addEvent,
  createAiProposal,
  decideAiProposal,
  listAiProposals,
  listDlq,
  listEvents,
  listStudies
} from './store.js';

const demoStudies = [
  {
    study_id: 'NCT-DEMO-1001',
    title: 'Precision Oncology Combination Study',
    study_status: 'Recruiting',
    phase: 'Phase II',
    target_enrollment: 240,
    country: 'United States',
    source: 'clinicaltrials'
  },
  {
    study_id: 'EU-DEMO-2048',
    title: 'Rare Disease Natural History Registry',
    study_status: 'Active',
    phase: 'Observational',
    target_enrollment: 85,
    country: 'Germany',
    source: 'euctr'
  },
  {
    study_id: 'NCT-DEMO-3092',
    title: 'Cardiometabolic Outcomes Follow-up',
    study_status: 'Completed',
    phase: 'Phase III',
    target_enrollment: 620,
    country: 'Canada',
    source: 'clinicaltrials'
  }
];

function createProposal(rawPayload) {
  const proposal = createAiProposal({
    ...inferSchemaProposal(rawPayload),
    rawPayload
  });
  addEvent({
    entity: proposal.proposedMapping.studyId || 'unknown-study',
    eventType: 'ai_schema_proposed',
    source: rawPayload.source || 'demo_seed',
    actor: 'schema_inference_service',
    payload: { proposalId: proposal.id, confidenceScore: proposal.confidenceScore }
  });
  return proposal;
}

export function seedDemoData() {
  if (listStudies().length || listAiProposals().length || listDlq().length || listEvents().length) {
    return { seeded: false, reason: 'The in-memory store already contains data.' };
  }

  for (const payload of demoStudies) {
    const validation = validateStudyPayload(payload);
    if (!validation.valid) throw new Error(`Invalid built-in demo study: ${payload.study_id}`);
    processIngestion(validation.normalized, {
      idempotencyKey: `demo-study:${payload.study_id}`,
      actor: 'demo_seed'
    });
  }

  createProposal({
    study_id: 'NCT-DEMO-4107',
    title: 'Immunotherapy Biomarker Expansion',
    study_status: 'Recruiting',
    phase: 'Phase II',
    target_enrollment: 180,
    country: 'United States',
    source: 'clinicaltrials'
  });

  createProposal({
    sourceid: 'REG-DEMO-77',
    protocol_name: 'Regional Registry Mapping Review',
    study_state: 'Active',
    study_stage: 'Observational',
    planned_participants: 'TBD',
    country: 'Australia',
    source: 'regional_csv'
  });

  const approvedProposal = createProposal({
    study_id: 'NCT-DEMO-5201',
    title: 'Approved Data Steward Mapping Example',
    study_status: 'Active',
    phase: 'Phase I',
    target_enrollment: 72,
    country: 'United Kingdom',
    source: 'clinicaltrials'
  });
  const approvedMapping = validateStudyPayload(approvedProposal.proposedMapping);
  const approvedDecision = decideAiProposal(
    approvedProposal.id,
    'approved',
    'demo_data_steward',
    'Seeded example of an approved schema mapping.',
    approvedMapping.normalized
  );
  const approvedIngestion = processIngestion(approvedMapping.normalized, {
    idempotencyKey: `demo-proposal:${approvedProposal.id}`,
    actor: 'demo_data_steward'
  });
  addEvent({
    entity: approvedMapping.normalized.studyId,
    eventType: 'ai_mapping_approved',
    source: approvedProposal.rawPayload.source,
    actor: approvedDecision.approvedBy,
    correlationId: approvedProposal.id,
    payload: { proposalId: approvedProposal.id, notes: approvedDecision.decisionNotes }
  });
  if (!approvedIngestion.canonical) throw new Error('Failed to materialize demo-approved study.');

  const rejectedProposal = createProposal({
    study_id: 'NCT-DEMO-5302',
    title: 'Rejected Mapping Example',
    study_status: 'Active',
    phase: 'Phase II',
    target_enrollment: 95,
    country: 'France',
    source: 'clinicaltrials'
  });
  const rejectedDecision = decideAiProposal(
    rejectedProposal.id,
    'rejected',
    'demo_data_steward',
    'Seeded example: source status semantics require clarification.'
  );
  addEvent({
    entity: rejectedProposal.proposedMapping.studyId,
    eventType: 'ai_mapping_rejected',
    source: rejectedProposal.rawPayload.source,
    actor: rejectedDecision.rejectedBy,
    correlationId: rejectedProposal.id,
    payload: { proposalId: rejectedProposal.id, notes: rejectedDecision.decisionNotes }
  });

  const invalidPayload = {
    study_id: 'NCT-DEMO-DLQ-01',
    title: 'Partner Feed - Enrollment Needs Review',
    study_status: 'Recruiting',
    phase: 'Phase II',
    target_enrollment: 'TBD',
    country: 'Japan',
    source: 'partner_csv'
  };
  const dlqValidation = validateStudyPayload(invalidPayload);
  recordRejectedPayload(invalidPayload, dlqValidation.errors, {
    source: invalidPayload.source,
    actor: 'demo_seed',
    fileName: 'partner-study-feed.csv',
    rowNumber: 7,
    correlationId: 'demo-import-dlq'
  });

  addEvent({
    entity: 'demo-data',
    eventType: 'demo_workflow_seeded',
    source: 'application_startup',
    actor: 'system',
    payload: { studies: listStudies().length, proposals: listAiProposals().length, openDlq: listDlq().filter((entry) => entry.status === 'open').length }
  });

  return {
    seeded: true,
    studies: listStudies().length,
    proposals: listAiProposals().length,
    openDlq: listDlq().filter((entry) => entry.status === 'open').length,
    events: listEvents(100).length
  };
}
