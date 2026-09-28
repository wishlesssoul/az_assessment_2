import test from 'node:test';
import assert from 'node:assert/strict';

import { paginate, sortNewestFirst } from './paginationService.js';

test('pagination returns stable pages, totals, and navigation metadata', () => {
  const result = paginate([1, 2, 3, 4, 5], '2', '2');

  assert.deepEqual(result.items, [3, 4]);
  assert.deepEqual(result.pagination, {
    page: 2,
    pageSize: 2,
    totalItems: 5,
    totalPages: 3,
    hasPrevious: true,
    hasNext: true
  });
});

test('pagination clamps invalid page and page-size values', () => {
  const result = paginate(['a', 'b'], '-5', '1000');

  assert.deepEqual(result.items, ['a', 'b']);
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.pageSize, 100);
  assert.equal(result.pagination.totalPages, 1);
});

test('newest-first ordering breaks timestamp ties in favor of later inserted records', () => {
  const timestamp = '2026-09-28T10:00:00.000Z';
  const sorted = sortNewestFirst([
    { id: 'first', createdAt: timestamp },
    { id: 'second', createdAt: timestamp },
    { id: 'newest', createdAt: '2026-09-29T10:00:00.000Z' }
  ], 'createdAt');

  assert.deepEqual(sorted.map((item) => item.id), ['newest', 'second', 'first']);
});
