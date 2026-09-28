import crypto from 'crypto';

const canonicalStudies = new Map();
const eventLog = [];
const dlqEntries = [];
const aiProposals = new Map();
const idempotencyKeys = new Map();

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function listStudies() {
  return [...canonicalStudies.values()].map((study) => ({ ...study }));
}

export function upsertStudy(study) {
  const record = {
    ...study,
    lastUpdated: nowIso()
  };
  canonicalStudies.set(record.studyId, record);
  return { ...record };
}

export function addEvent({ entity, eventType, source, payload, actor = 'system', correlationId = null }) {
  const previous = eventLog.at(-1);
  const timestamp = nowIso();
  const sequence = eventLog.length + 1;
  const previousHash = previous?.hash || 'GENESIS';
  const eventBody = {
    id: makeId('evt'),
    sequence,
    entity,
    eventType,
    source,
    actor,
    correlationId,
    payload,
    timestamp,
    previousHash
  };
  const entry = {
    ...eventBody,
    hash: crypto.createHash('sha256').update(JSON.stringify(eventBody)).digest('hex')
  };
  eventLog.push(entry);
  return { ...entry };
}

export function getDiffSince(timestamp) {
  if (!timestamp) {
    return [...eventLog].slice(-20);
  }

  const since = new Date(timestamp).getTime();
  return eventLog.filter((event) => new Date(event.timestamp).getTime() >= since);
}

export function listEvents(limit = 100) {
  return eventLog.slice(-Math.max(1, Number(limit) || 100)).reverse().map((event) => ({ ...event }));
}

export function verifyEventChain() {
  let previousHash = 'GENESIS';
  for (const event of eventLog) {
    const { hash, ...eventBody } = event;
    const expectedHash = crypto.createHash('sha256').update(JSON.stringify(eventBody)).digest('hex');
    if (event.previousHash !== previousHash || hash !== expectedHash) {
      return { valid: false, sequence: event.sequence };
    }
    previousHash = hash;
  }
  return { valid: true, eventCount: eventLog.length };
}

export function getIdempotentResult(key, fingerprint) {
  if (!key) return null;
  const saved = idempotencyKeys.get(key);
  if (!saved) return null;
  return saved.fingerprint === fingerprint
    ? { ...saved.result, duplicate: true }
    : { conflict: true };
}

export function saveIdempotentResult(key, result, fingerprint) {
  if (key) idempotencyKeys.set(key, { result, fingerprint });
}

export function pushDlq(entry) {
  const record = {
    id: makeId('dlq'),
    timestamp: nowIso(),
    ...entry
  };
  dlqEntries.unshift(record);
  return record;
}

export function resolveDlqEntry(id, resolution = 'replayed') {
  const entry = dlqEntries.find((item) => item.id === id);
  if (!entry) return null;
  entry.status = resolution;
  entry.resolvedAt = nowIso();
  return { ...entry };
}

export function listDlq() {
  return [...dlqEntries];
}

export function getDlqEntry(id) {
  const entry = dlqEntries.find((item) => item.id === id);
  return entry ? { ...entry } : null;
}

export function createAiProposal(proposal) {
  const record = {
    ...proposal,
    id: makeId('proposal'),
    status: 'pending_review',
    createdAt: nowIso()
  };
  aiProposals.set(record.id, record);
  return { ...record };
}

export function listAiProposals() {
  return [...aiProposals.values()].map((proposal) => ({ ...proposal }));
}

export function getAiProposal(id) {
  const proposal = aiProposals.get(id);
  return proposal ? { ...proposal } : null;
}

export function approveAiProposal(id) {
  const proposal = aiProposals.get(id);
  if (!proposal) {
    return null;
  }

  const approved = {
    ...proposal,
    status: 'approved',
    approvedAt: nowIso(),
    approvedBy: 'data_steward'
  };

  aiProposals.set(id, approved);
  return { ...approved };
}

export function decideAiProposal(id, decision, actor = 'data_steward', notes = '', appliedMapping = null) {
  const proposal = aiProposals.get(id);
  if (!proposal || proposal.status !== 'pending_review') return null;
  const decided = {
    ...proposal,
    status: decision,
    decidedAt: nowIso(),
    approvedBy: decision === 'approved' ? actor : undefined,
    rejectedBy: decision === 'rejected' ? actor : undefined,
    decisionNotes: notes,
    appliedMapping: appliedMapping || proposal.appliedMapping || null
  };
  aiProposals.set(id, decided);
  return { ...decided };
}

export function getStudyById(studyId) {
  return canonicalStudies.get(studyId) ? { ...canonicalStudies.get(studyId) } : null;
}
