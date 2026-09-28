const API_BASE = '/api';

export async function fetchJson(url, options = {}) {
  const { headers = {}, ...requestOptions } = options;
  const response = await fetch(url, {
    ...requestOptions,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
  if (!response.ok) {
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(text || 'Request failed');
    }
    const details = body.errors?.map((item) => `${item.loc?.join('.') || 'payload'}: ${item.msg}`).join('; ');
    throw new Error(details ? `${body.message || 'Request failed'}: ${details}` : body.message || text);
  }
  return response.json();
}

export async function loadDashboardData(pages) {
  const [studies, proposals, dlq, events, ledger] = await Promise.all([
    fetchJson(`${API_BASE}/studies?page=${pages.studies.page}&pageSize=${pages.studies.pageSize}`),
    fetchJson(`${API_BASE}/ai-proposals?page=${pages.proposals.page}&pageSize=${pages.proposals.pageSize}`),
    fetchJson(`${API_BASE}/dlq?page=${pages.dlq.page}&pageSize=${pages.dlq.pageSize}`),
    fetchJson(`${API_BASE}/events?page=${pages.events.page}&pageSize=${pages.events.pageSize}`),
    fetchJson(`${API_BASE}/events/verify`)
  ]);

  return { studies, proposals, dlq, events, ledger };
}

export const api = {
  ingest: (payload) => fetchJson(`${API_BASE}/ingest`, { method: 'POST', body: JSON.stringify(payload) }),
  importFile: (payload, batchId) => fetchJson(`${API_BASE}/ingest/import`, {
    method: 'POST',
    headers: { 'Idempotency-Key': batchId },
    body: JSON.stringify(payload)
  }),
  approveProposal: (id, mapping) => fetchJson(`${API_BASE}/ai-proposals/${id}/approve`, {
    method: 'POST', body: JSON.stringify({ mapping })
  }),
  rejectProposal: (id, notes) => fetchJson(`${API_BASE}/ai-proposals/${id}/reject`, {
    method: 'POST', body: JSON.stringify({ notes })
  }),
  replayDlq: (id, payload) => fetchJson(`${API_BASE}/dlq/${id}/replay`, {
    method: 'POST', body: JSON.stringify({ payload })
  }),
  createProposal: (payload) => fetchJson(`${API_BASE}/ai-proposals`, {
    method: 'POST', body: JSON.stringify(payload)
  })
};
