import { api, fetchJson, loadDashboardData } from './api.js';
import { escapeHtml, renderDashboard, setScreen, showNotice } from './ui.js';

const state = {
  currentScreen: 'dashboard',
  studies: [],
  proposals: [],
  dlq: [],
  events: [],
  ledger: { valid: true },
  pages: {
    studies: { page: 1, pageSize: 5, pagination: null },
    proposals: { page: 1, pageSize: 10, pagination: null },
    dlq: { page: 1, pageSize: 10, pagination: null },
    events: { page: 1, pageSize: 20, pagination: null }
  }
};

function resetPages(...keys) {
  keys.forEach((key) => { state.pages[key].page = 1; });
}

async function loadDashboard() {
  try {
    const data = await loadDashboardData(state.pages);
    state.studies = data.studies.studies || [];
    state.proposals = data.proposals.proposals || [];
    state.dlq = data.dlq.dlq || [];
    state.events = data.events.events || [];
    state.ledger = data.ledger;

    for (const key of Object.keys(state.pages)) {
      const response = data[key];
      state.pages[key].pagination = response.pagination;
      state.pages[key].page = response.pagination.page;
    }

    renderDashboard(state, handlers);
  } catch (error) {
    console.error(error);
    showNotice(error.message, true);
  }
}

async function changePage(key, page, pageSize = state.pages[key].pageSize) {
  state.pages[key].page = page;
  state.pages[key].pageSize = pageSize;
  await loadDashboard();
}

const handlers = {
  changePage,
  async approve(id, mapping) {
    try {
      await api.approveProposal(id, mapping);
      showNotice('Mapping approved and canonical study ingested.');
      resetPages('studies', 'proposals', 'events');
      await loadDashboard();
    } catch (error) { showNotice(error.message, true); }
  },
  async reject(id) {
    const notes = window.prompt('Reason for rejecting this mapping?') || '';
    try {
      await api.rejectProposal(id, notes);
      showNotice('Proposal rejected and recorded in the event ledger.');
      resetPages('proposals', 'events');
      await loadDashboard();
    } catch (error) { showNotice(error.message, true); }
  },
  async replay(id, payload) {
    try {
      await api.replayDlq(id, payload);
      showNotice('DLQ payload repaired, validated, and replayed.');
      resetPages('studies', 'dlq', 'events');
      await loadDashboard();
    } catch (error) { showNotice(error.message, true); }
  }
};

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => setScreen(button.dataset.screen));
  });
  document.getElementById('refreshMetrics').addEventListener('click', loadDashboard);
  document.getElementById('refreshOverview').addEventListener('click', loadDashboard);
}

function bindSampleProposals() {
  document.getElementById('loadSample').addEventListener('click', async () => {
    const samplePayloads = [
      { study_id: 'NCT-8801', title: 'Precision Oncology Cohort', study_status: 'Recruiting', phase: 'Phase II', target_enrollment: 240, source: 'clinicaltrials', country: 'United States' },
      { study_id: 'EU-2221', title: 'Rare Disease Registry', study_status: 'Active', phase: 'Phase I', target_enrollment: 'TBD', source: 'regional_csv', country: 'Germany' },
      { study_id: 'NCT-1938', title: 'CardioMetabolic Outcome Study', status: 'Completed', phase: 'Phase III', targetEnrollment: 500, source: 'clinicaltrials', country: 'Canada' }
    ];
    try {
      await Promise.all(samplePayloads.map((payload) => api.createProposal(payload)));
      showNotice(`${samplePayloads.length} sample schema proposals added to steward review.`);
      resetPages('proposals', 'events');
      await loadDashboard();
    } catch (error) { showNotice(error.message, true); }
  });
}

function bindManualIngestion() {
  document.getElementById('fillSamplePayload').addEventListener('click', () => {
    const form = document.getElementById('ingestForm');
    form.studyId.value = 'NCT-3047';
    form.title.value = 'Immunotherapy Biomarker Trial';
    form.status.value = 'Active';
    form.phase.value = 'Phase II';
    form.targetEnrollment.value = '220';
    form.country.value = 'United States';
    form.studyType.value = 'Interventional';
  });

  document.getElementById('ingestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      study_id: form.studyId.value,
      title: form.title.value,
      study_status: form.status.value,
      phase: form.phase.value,
      target_enrollment: Number(form.targetEnrollment.value),
      country: form.country.value,
      study_type: form.studyType.value,
      source: form.source.value
    };
    try {
      await api.ingest(payload);
      showNotice('Study validated and ingested successfully.');
      resetPages('studies', 'events');
      await loadDashboard();
      setScreen('dashboard');
    } catch (error) { showNotice(error.message, true); }
  });
}

function bindFileImport() {
  document.getElementById('fileImportForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = document.getElementById('importFile').files[0];
    const status = document.getElementById('importFileStatus');
    const button = document.getElementById('importFileButton');
    const results = document.getElementById('fileImportResults');
    if (!file) {
      showNotice('Choose a CSV or JSON file first.', true);
      return;
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'json'].includes(extension)) {
      showNotice('Only .csv and .json files are supported.', true);
      return;
    }

    button.disabled = true;
    status.textContent = 'Reading and validating rows…';
    results.innerHTML = '';
    try {
      const summary = await api.importFile({ fileName: file.name, format: extension, content: await file.text() }, `file-${crypto.randomUUID()}`);
      status.textContent = `${summary.ingested} ingested · ${summary.rejected} rejected · ${summary.conflicts} conflicts`;
      results.innerHTML = `
        <div class="import-result"><strong>${escapeHtml(summary.fileName)}</strong> · ${escapeHtml(summary.total)} records processed · Batch ${escapeHtml(summary.batchId)}</div>
        ${summary.results.map((result) => `
          <div class="import-result">Row ${escapeHtml(result.rowNumber)} · <strong>${escapeHtml(result.status)}</strong>
            ${result.studyId ? ` · ${escapeHtml(result.studyId)}` : ''}${result.dlqId ? ` · DLQ ${escapeHtml(result.dlqId)}` : ''}
            ${result.errors?.length ? `<div class="muted">${result.errors.map((item) => `${escapeHtml(item.loc?.join('.') || 'payload')}: ${escapeHtml(item.msg)}`).join(' · ')}</div>` : ''}
            ${result.message ? `<div class="muted">${escapeHtml(result.message)}</div>` : ''}
          </div>
        `).join('')}
      `;
      showNotice(`File import complete: ${summary.ingested} ingested, ${summary.rejected} sent to DLQ.`);
      resetPages('studies', 'dlq', 'events');
      await loadDashboard();
    } catch (error) {
      status.textContent = 'Import failed';
      showNotice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

bindNavigation();
bindSampleProposals();
bindManualIngestion();
bindFileImport();
loadDashboard();
