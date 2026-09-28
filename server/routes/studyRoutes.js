import { Router } from 'express';

import { paginate, sortNewestFirst } from '../services/paginationService.js';
import { getDiffSince, getStudyById, listStudies } from '../data/store.js';

const router = Router();

router.get('/', (req, res) => {
  const result = paginate(sortNewestFirst(listStudies(), 'lastUpdated'), req.query.page, req.query.pageSize);
  res.json({ studies: result.items, pagination: result.pagination });
});

router.get('/diff', (req, res) => {
  const result = paginate(getDiffSince(req.query.since || null).slice().reverse(), req.query.page, req.query.pageSize);
  res.json({ diff: result.items, pagination: result.pagination });
});

router.get('/:id', (req, res) => {
  const study = getStudyById(req.params.id);
  if (!study) return res.status(404).json({ message: 'Study not found.' });
  return res.json({ study });
});

export default router;
