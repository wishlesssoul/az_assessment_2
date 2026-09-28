export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function showNotice(message, isError = false) {
  const notice = document.getElementById('notice');
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.classList.add('visible');
  window.setTimeout(() => notice.classList.remove('visible'), 5000);
}

export function setScreen(name) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.screen === name);
  });
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('active', screen.id === `screen-${name}`);
  });
}

function renderStats(state) {
  const active = state.studies.filter((study) => study.status === 'Active' || study.status === 'Recruiting').length;
  const pending = state.proposals.filter((proposal) => proposal.status === 'pending_review').length;
  const cards = [
    { label: 'Canonical Studies', value: state.pages.studies.pagination?.totalItems || 0, trend: '+14.2%' },
    { label: 'Active/Recruiting', value: active, trend: '+8.5%' },
    { label: 'AI Proposals', value: state.pages.proposals.pagination?.totalItems || 0, trend: `${pending} pending review` },
    { label: 'DLQ Errors', value: state.pages.dlq.pagination?.totalItems || 0, trend: 'Open and resolved records' }
  ];

  document.getElementById('statsGrid').innerHTML = cards.map((card) => `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="stat-value">${escapeHtml(card.value)}</div>
      <div class="stat-trend">${escapeHtml(card.trend)}</div>
    </div>
  `).join('');
}

function renderStudies(state) {
  document.getElementById('studyList').innerHTML = state.studies.map((study) => `
    <div class="item">
      <div><strong>${escapeHtml(study.studyId)}</strong><br /><span class="muted">${escapeHtml(study.title)}</span></div>
      <span class="status ${study.status === 'Active' || study.status === 'Recruiting' ? 'approved' : 'pending'}">${escapeHtml(study.status)}</span>
    </div>
  `).join('') || '<div class="muted">No studies found.</div>';
}

function renderSummary(state) {
  const latestEvent = state.events[0];
  const cards = [
    { title: 'Schema inference', detail: 'AI mapping proposals require validation and steward approval.' },
    { title: 'DLQ signals', detail: `${state.pages.dlq.pagination?.totalItems || 0} quarantined records are available for review.` },
    { title: 'Latest event', detail: latestEvent ? `${latestEvent.eventType} · ${latestEvent.entity}` : 'No events recorded yet.' }
  ];
  document.getElementById('summaryList').innerHTML = cards.map((card) => `
    <div class="proposal-box"><strong>${escapeHtml(card.title)}</strong><div class="muted">${escapeHtml(card.detail)}</div></div>
  `).join('');
}

function renderProposals(state, handlers) {
  const container = document.getElementById('proposalList');
  container.innerHTML = state.proposals.map((proposal) => `
    <div class="proposal-box">
      <div><strong>${escapeHtml(proposal.id)}</strong> <span class="status ${proposal.status === 'approved' ? 'approved' : proposal.status === 'rejected' ? 'rejected' : 'pending'}">${escapeHtml(proposal.status)}</span></div>
      <div class="muted">Confidence: ${escapeHtml(proposal.confidenceScore)}% · ${escapeHtml(proposal.recommendation || 'steward review required')}</div>
      <div class="mapping-grid">
        ${Object.entries(proposal.proposedMapping || {}).map(([key, value]) => `
          <label>${escapeHtml(key)}<input data-proposal-field="${escapeHtml(key)}" value="${escapeHtml(value)}" ${proposal.status !== 'pending_review' ? 'disabled' : ''} /></label>
        `).join('')}
      </div>
      ${proposal.policyEvidence?.length ? `<div class="muted">Policy evidence: ${proposal.policyEvidence.map((item) => escapeHtml(item.title)).join(' · ')}</div>` : ''}
      ${proposal.decisionNotes ? `<div class="muted">Steward notes: ${escapeHtml(proposal.decisionNotes)}</div>` : ''}
      ${proposal.status === 'pending_review' ? `<div class="pill-row" style="margin-top:8px;"><button class="button success" data-approve="${escapeHtml(proposal.id)}">Approve &amp; ingest</button><button class="button danger" data-reject="${escapeHtml(proposal.id)}">Reject</button></div>` : ''}
    </div>
  `).join('') || '<div class="muted">No AI proposals in this page.</div>';

  container.querySelectorAll('[data-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.proposal-box');
      const mapping = Object.fromEntries([...card.querySelectorAll('[data-proposal-field]')].map((input) => [input.dataset.proposalField, input.value]));
      await handlers.approve(button.dataset.approve, mapping);
    });
  });
  container.querySelectorAll('[data-reject]').forEach((button) => {
    button.addEventListener('click', async () => handlers.reject(button.dataset.reject));
  });
}

function renderDlq(state, handlers) {
  const container = document.getElementById('dlqList');
  container.innerHTML = state.dlq.map((item) => `
    <div class="proposal-box">
      <div><strong>${escapeHtml(item.event)}</strong> <span class="status ${item.status === 'replayed' ? 'approved' : 'pending'}">${escapeHtml(item.status || 'open')}</span></div>
      <div class="muted">${escapeHtml(item.component)} · ${escapeHtml(item.source)} · ${escapeHtml(new Date(item.timestamp).toLocaleString())}</div>
      <div class="field-grid" style="margin-top:10px;">
        <label>Repair payload (JSON)<textarea rows="8" data-dlq-payload="${escapeHtml(item.id)}">${escapeHtml(JSON.stringify(item.raw_payload || {}, null, 2))}</textarea></label>
        <div><strong>Validation errors</strong><pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(item.error_surface || [], null, 2))}</pre></div>
      </div>
      ${item.status === 'open' ? `<button class="button warning" data-replay="${escapeHtml(item.id)}">Validate &amp; replay</button>` : ''}
    </div>
  `).join('') || '<div class="muted">No DLQ records in this page.</div>';

  container.querySelectorAll('[data-replay]').forEach((button) => {
    button.addEventListener('click', async () => {
      const payload = JSON.parse(container.querySelector(`[data-dlq-payload="${button.dataset.replay}"]`).value);
      await handlers.replay(button.dataset.replay, payload);
    });
  });
}

function renderEvents(state) {
  document.getElementById('eventTableBody').innerHTML = state.events.map((event) => `
    <tr>
      <td>${escapeHtml(event.sequence)}</td><td>${escapeHtml(event.eventType)}</td><td>${escapeHtml(event.entity)}</td>
      <td>${escapeHtml(event.actor)}</td><td>${escapeHtml(new Date(event.timestamp).toLocaleString())}</td>
      <td class="hash" title="${escapeHtml(event.hash)}">${escapeHtml(event.hash)}</td>
    </tr>
  `).join('');
}

function renderPager(key, pageState, targetId, onPageChange) {
  const { page, pageSize, pagination } = pageState;
  const container = document.getElementById(targetId);
  if (!pagination || pagination.totalItems === 0) {
    container.innerHTML = '<div class="pager">No records</div>';
    return;
  }
  container.innerHTML = `
    <div class="pager">
      <span>Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, pagination.totalItems)} of ${pagination.totalItems}</span>
      <div class="pager-controls">
        <label>Rows<select data-page-size="${key}" aria-label="Rows per page">${[5, 10, 20, 50].map((size) => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}</select></label>
        <button class="button secondary" data-page="${key}" data-direction="previous" ${pagination.hasPrevious ? '' : 'disabled'}>Previous</button>
        <span>Page ${page} of ${Math.max(pagination.totalPages, 1)}</span>
        <button class="button secondary" data-page="${key}" data-direction="next" ${pagination.hasNext ? '' : 'disabled'}>Next</button>
      </div>
    </div>
  `;
  container.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
    const delta = button.dataset.direction === 'next' ? 1 : -1;
    onPageChange(key, page + delta, pageSize);
  }));
  container.querySelector('[data-page-size]')?.addEventListener('change', (event) => {
    onPageChange(key, 1, Number(event.target.value));
  });
}

export function renderDashboard(state, handlers) {
  renderStats(state);
  renderStudies(state);
  renderSummary(state);
  renderProposals(state, handlers);
  renderDlq(state, handlers);
  renderEvents(state);
  renderPager('studies', state.pages.studies, 'studiesPager', handlers.changePage);
  renderPager('proposals', state.pages.proposals, 'proposalsPager', handlers.changePage);
  renderPager('dlq', state.pages.dlq, 'dlqPager', handlers.changePage);
  renderPager('events', state.pages.events, 'eventsPager', handlers.changePage);
  document.querySelector('#screen-audit .section-head h2').textContent = state.ledger.valid
    ? `Immutable Event Ledger · ${state.ledger.eventCount} verified`
    : `Event Ledger integrity failure at sequence ${state.ledger.sequence}`;
}
