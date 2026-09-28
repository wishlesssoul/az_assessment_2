const policyKnowledge = [
  {
    id: 's1',
    title: 'Clinical study identifier mapping',
    content: 'Use the canonical clinical study identifier field from the source payload. Preserve the NCT or source study id and map to studyId.',
    tags: ['studyId', 'nct', 'clinical', 'identifier']
  },
  {
    id: 's2',
    title: 'Eligibility and enrollment rules',
    content: 'Enrollment values must be integer-like, non-null, and validated against the source batch before approval. Ambiguous values should be quarantined.',
    tags: ['enrollment', 'target', 'int', 'integer']
  },
  {
    id: 's3',
    title: 'Study status normalization',
    content: 'Status values are normalized into one of Active, Completed, Recruiting, Withdrawn, or Unknown for consistent canonical reads.',
    tags: ['status', 'phase', 'canonical']
  }
];

export function inferSchemaProposal(rawPayload = {}) {
  const fields = Object.keys(rawPayload || {});
  const aliases = fields.map((field) => field.toLowerCase());
  const enrollmentInput = rawPayload.target_enrollment ?? rawPayload.targetEnrollment ?? rawPayload.enrollment ?? rawPayload.planned_participants ?? rawPayload.participants;
  const enrollmentProvided = enrollmentInput !== undefined && enrollmentInput !== null && String(enrollmentInput).trim() !== '';
  const parsedEnrollment = enrollmentProvided ? Number(enrollmentInput) : null;
  const enrollmentValid = parsedEnrollment !== null && Number.isFinite(parsedEnrollment) && Number.isInteger(parsedEnrollment) && parsedEnrollment >= 0;

  const evidence = policyKnowledge.filter((policy) =>
    policy.tags.some((tag) => {
      const normalizedTag = tag.toLowerCase();
      return aliases.some((field) => {
        if (field.includes(normalizedTag)) return true;
        if (normalizedTag === 'studyid' && (field.includes('study') || field.includes('protocol') || field.includes('sourceid'))) return true;
        if (normalizedTag === 'status' && (field.includes('status') || field.includes('state'))) return true;
        if (normalizedTag === 'phase' && (field.includes('phase') || field.includes('stage'))) return true;
        if ((normalizedTag === 'enrollment' || normalizedTag === 'target' || normalizedTag === 'int') && (field.includes('participant') || field.includes('enroll') || field.includes('target'))) return true;
        return false;
      });
    })
  );

  const inferredConfidence = Math.min(97, 72 + evidence.length * 9 + Math.min(fields.length, 5));
  const confidence = enrollmentProvided && !enrollmentValid ? Math.min(inferredConfidence, 60) : inferredConfidence;

  return {
    sourceShape: Object.keys(rawPayload || {}),
    proposedMapping: {
      studyId: rawPayload.study_id || rawPayload.nct_id || rawPayload.sourceid || 'auto_generated_id',
      title: rawPayload.title || rawPayload.study_title || rawPayload.protocol_name || 'Untitled Study',
      status: rawPayload.study_status || rawPayload.status || rawPayload.study_state || 'Unknown',
      phase: rawPayload.phase || rawPayload.study_phase || rawPayload.study_stage || 'Unknown',
      targetEnrollment: enrollmentValid ? parsedEnrollment : null,
      country: rawPayload.country || rawPayload.location_country || 'Unknown'
    },
    confidenceScore: Math.round(confidence),
    policyEvidence: evidence,
    requiresHumanApproval: confidence < 85,
    recommendation: confidence >= 85 ? 'approve_for_mapping' : 'escalate_to_steward'
  };
}
