import { FEATURE_FLAGS, insightIdSchema } from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as insights from './insight.service';

export function createInsightsRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.INSIGHTS));

  router.get('/', async (req, res) => {
    res.json({ items: await insights.listInsights(currentUserId(req)) });
  });

  router.post('/:id/dismiss', async (req, res) => {
    await insights.dismissInsight(currentUserId(req), parse(insightIdSchema, req.params.id));
    res.status(204).end();
  });

  router.delete('/:id/dismiss', async (req, res) => {
    await insights.restoreInsight(currentUserId(req), parse(insightIdSchema, req.params.id));
    res.status(204).end();
  });

  return router;
}
