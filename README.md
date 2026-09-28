# Clinical Metadata Ingestion Platform

A modular local prototype for ingesting clinical study metadata, validating and normalizing records, assisting source-schema mapping, and supporting data-steward review. It is based on the supplied technical architecture review and runs without cloud or enterprise infrastructure.

## Contents

- [What the app does](#what-the-app-does)
- [Run locally](#run-locally)
- [Workflow](#workflow)
- [CSV and JSON imports](#csv-and-json-imports)
- [API reference](#api-reference)
- [Pagination and ordering](#pagination-and-ordering)
- [Project structure](#project-structure)
- [Demo data](#demo-data)
- [Tests](#tests)
- [Prototype limitations](#prototype-limitations)

## What the app does

The browser dashboard provides these workflows:

- **Dashboard:** canonical studies, current activity counts, latest events, and pagination.
- **Manual ingestion:** submit an individual study record.
- **Bulk import:** upload a CSV or JSON file and view per-row outcomes.
- **AI schema proposals:** inspect inferred field mappings, confidence and policy evidence; edit and approve or reject proposals.
- **Dead Letter Queue (DLQ):** inspect invalid records, repair their payloads, and validate/replay them.
- **Event ledger:** browse newest-first events and check the SHA-256 hash chain.

The schema inference service is a local heuristic prototype. Its suggestions are advisory; all approved mappings are run through canonical validation before creating a study.

## Run locally

Requirements: Node.js 20 or later and npm.

From this folder:

```powershell
npm install
npm start
```

Open [http://localhost:3002](http://localhost:3002). To use another port, set `PORT` before starting the server, for example `$env:PORT=3003; npm start` in PowerShell.

For development with automatic server restarts, run `npm run dev`.

## Workflow

### Manual ingestion

The manual form submits to `POST /api/ingest`. The server:

1. Normalizes supported aliases, such as `study_id`/`studyId`, `study_status`/`status`, and `target_enrollment`/`targetEnrollment`.
2. Validates the canonical study identifier, title, status, and non-negative integer target enrollment.
3. On success, appends a `study_ingested` event and updates the in-memory canonical-study view.
4. On failure, returns HTTP 422, writes an `ingestion_rejected` event, and creates an open DLQ entry.

Valid statuses normalize to `Active`, `Completed`, `Recruiting`, `Withdrawn`, or `Unknown`. Missing optional phase and country values become `Unknown`.

### AI schema review

`POST /api/ai-proposals` creates a proposal from an incoming source-shaped object. The proposal includes a suggested canonical mapping, confidence score, policy evidence, and review recommendation. It remains pending until a steward decision:

- `POST /api/ai-proposals/:id/approve` accepts the edited mapping in the request body, validates it, records the decision, and ingests the canonical study.
- `POST /api/ai-proposals/:id/reject` records the rejection and optional steward notes.

### CSV and JSON batch import

The Ingestion screen accepts `.csv` and `.json` files. CSV requires a header row. JSON may be a top-level array or an object with a `records` array. The request body limit is 5 MB and the parser allows at most 5,000 rows per file. Every row is handled independently: valid rows are ingested; invalid rows are recorded in the event ledger and DLQ with their file name and row number. A bad row does not stop the remaining batch.

Sample files are provided at [public/samples/sample-studies.csv](public/samples/sample-studies.csv) and [public/samples/sample-studies.json](public/samples/sample-studies.json).

### DLQ replay

`POST /api/dlq/:id/replay` accepts a corrected `payload`, validates it again, then ingests and marks the DLQ record as replayed. Invalid corrections remain in the DLQ and return HTTP 422.

### Event ledger

Events are appended in sequence and linked with a SHA-256 hash and previous-event hash. `GET /api/events/verify` checks the in-process chain and reports its validity. This demonstrates tamper-evident event linking; it is not durable or a substitute for a production audit system.

## API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health and name |
| `GET` | `/api/studies` | Paginated canonical study list |
| `GET` | `/api/studies/:id` | Get one canonical study |
| `GET` | `/api/studies/diff?since=<ISO-8601>` | Paginated event diff since a timestamp |
| `POST` | `/api/ingest` | Validate and ingest one study |
| `POST` | `/api/ingest/import` | Parse and ingest a CSV/JSON batch |
| `GET` | `/api/ai-proposals` | Paginated schema proposal list |
| `POST` | `/api/ai-proposals` | Create a schema proposal from a source payload |
| `POST` | `/api/ai-proposals/:id/approve` | Validate, approve, and ingest a proposal mapping |
| `POST` | `/api/ai-proposals/:id/reject` | Reject a pending proposal |
| `GET` | `/api/dlq` | Paginated DLQ list |
| `POST` | `/api/dlq/:id/replay` | Validate and replay a corrected DLQ payload |
| `GET` | `/api/events` | Paginated event ledger |
| `GET` | `/api/events/verify` | Verify event hash-chain integrity |

### Example: individual ingestion

```http
POST /api/ingest
Content-Type: application/json
Idempotency-Key: partner-import-2026-001

{
  "study_id": "NCT-2047",
  "title": "Phase II Oncology Study",
  "study_status": "Recruiting",
  "phase": "Phase II",
  "target_enrollment": 180,
  "country": "United States",
  "source": "clinicaltrials"
}
```

The `Idempotency-Key` is optional. Repeating a key with identical normalized content returns the prior result; reusing it for different content returns HTTP 409.

### Example: file import

```http
POST /api/ingest/import
Content-Type: application/json
Idempotency-Key: studies-batch-001

{
  "fileName": "studies.csv",
  "format": "csv",
  "content": "study_id,title,status,target_enrollment\nNCT-1,Example,Active,50"
}
```

The response includes batch totals and a result for every row (`ingested`, `rejected`, `duplicate`, or `conflict`).

## Pagination and ordering

List endpoints for studies, proposals, DLQ entries, events, and study diffs accept `page` and `pageSize`, for example:

```text
/api/studies?page=1&pageSize=20
```

Responses include a `pagination` object with `page`, `pageSize`, `totalItems`, `totalPages`, `hasPrevious`, and `hasNext`. Page size defaults to 10 and is clamped between 1 and 100. Collections are returned newest-first; the event ledger uses descending sequence order. When timestamps tie, later-inserted records appear first.

## Project structure

```text
Problem2/
├── public/
│   ├── css/app.css             # Dashboard styling
│   ├── js/
│   │   ├── api.js              # HTTP client and API operations
│   │   ├── main.js             # UI state, handlers, workflow orchestration
│   │   └── ui.js               # Rendering, formatting, and pagination controls
│   ├── samples/                # Example CSV and JSON uploads
│   └── index.html              # Dashboard HTML shell
└── server/
    ├── app.js                  # Express middleware and route composition
    ├── index.js                # Startup, demo seed, and HTTP listener
    ├── config/                 # Runtime configuration
    ├── data/
    │   ├── store.js            # In-memory repositories and event ledger
    │   └── seedData.js         # Startup demo scenarios
    ├── routes/                 # HTTP handlers by domain
    └── services/               # Validation, import, inference, ingestion, pagination
```

Feature routes are separated into study, ingestion, proposal, DLQ, and event modules. Services contain business logic rather than browser concerns; frontend assets similarly separate API calls from rendering and orchestration.

## Demo data

At startup, the app creates representative canonical studies, pending/approved/rejected proposals, an open DLQ record, and related events. Demo data is seeded only when the process-local store is empty. A server restart resets the in-memory store, then recreates the demo records.

## Tests

Run the complete Node.js test suite:

```powershell
npm test
```

Tests cover validation, AI schema inference, CSV/JSON parsing, batch ingestion, DLQ routing, idempotency, event-chain verification, pagination, startup seeding, and HTTP route integration.

## Prototype limitations

This is a local architecture prototype, not a production deployment:

- Studies, proposals, DLQ entries, idempotency keys, and events are stored in process memory and are lost on restart.
- Kafka, EventStoreDB, PostgreSQL, cloud AI/RAG services, authentication/authorization, and alerting are not connected.
- The AI schema inference is heuristic and must not be treated as a validated clinical or regulatory decision system.
- The event hash chain only verifies the current in-memory process history; it does not provide durable or externally anchored audit evidence.

Before production use, add durable persistence, identity and role controls, operational monitoring, robust migrations and retention, and production-grade AI governance and validation.
