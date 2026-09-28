import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from './app.js';
import { seedDemoData } from './data/seedData.js';

let server;
let baseUrl;

before(async () => {
  seedDemoData();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('feature routers expose paginated latest-first collections and static modules', async () => {
  const [studiesResponse, proposalsResponse, dlqResponse, eventsResponse, staticResponse] = await Promise.all([
    fetch(`${baseUrl}/api/studies?page=1&pageSize=2`),
    fetch(`${baseUrl}/api/ai-proposals?page=1&pageSize=2`),
    fetch(`${baseUrl}/api/dlq?page=1&pageSize=1`),
    fetch(`${baseUrl}/api/events?page=1&pageSize=3`),
    fetch(`${baseUrl}/js/main.js`)
  ]);
  const [studies, proposals, dlq, events] = await Promise.all([
    studiesResponse.json(), proposalsResponse.json(), dlqResponse.json(), eventsResponse.json()
  ]);

  assert.equal(studies.pagination.totalItems, 4);
  assert.equal(studies.studies.length, 2);
  assert.equal(proposals.pagination.pageSize, 2);
  assert.equal(dlq.dlq[0].status, 'open');
  assert.equal(events.events.length, 3);
  assert.ok(events.events[0].sequence > events.events[1].sequence);
  assert.ok(events.events[1].sequence > events.events[2].sequence);
  assert.equal(staticResponse.status, 200);
  assert.match(await staticResponse.text(), /loadDashboardData/);
});
