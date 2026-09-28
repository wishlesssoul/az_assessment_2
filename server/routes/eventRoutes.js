import { Router } from 'express';

import { paginate } from '../services/paginationService.js';
import { getDiffSince, listEvents, verifyEventChain } from '../data/store.js';

const router = Router();

router.get('/', (req, res) => {
  const result = paginate(listEvents(Number.MAX_SAFE_INTEGER), req.query.page, req.query.pageSize ?? req.query.limit);
  res.json({ events: result.items, pagination: result.pagination });
});

router.get('/verify', (req, res) => {
  const result = verifyEventChain();
  res.status(result.valid ? 200 : 409).json(result);
});

router.get('/diff', (req, res) => {
  const result = paginate(getDiffSince(req.query.since || null).slice().reverse(), req.query.page, req.query.pageSize);
  res.json({ diff: result.items, pagination: result.pagination });
});

export default router;
