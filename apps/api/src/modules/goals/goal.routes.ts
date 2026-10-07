import {
  createContributionSchema,
  createGoalSchema,
  FEATURE_FLAGS,
  updateGoalSchema,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { requireFeature } from '../features/features.routes';
import * as goals from './goal.service';

export function createGoalsRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.SAVINGS_GOALS));

  router.get('/', async (req, res) => {
    res.json({ items: await goals.listGoals(currentUserId(req)) });
  });

  router.post('/', idempotent, async (req, res) => {
    const input = parse(createGoalSchema, req.body);
    res.status(201).json(await goals.createGoal(currentUserId(req), input));
  });

  router.delete('/contributions/:id', async (req, res) => {
    await goals.deleteContribution(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  router.get('/:id/contributions', async (req, res) => {
    res.json({ items: await goals.listContributions(currentUserId(req), req.params.id) });
  });

  router.post('/:id/contributions', idempotent, async (req, res) => {
    const input = parse(createContributionSchema, req.body);
    const { id } = req.params as { id: string };
    res.status(201).json(await goals.createContribution(currentUserId(req), id, input));
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(updateGoalSchema, req.body);
    res.json(await goals.updateGoal(currentUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await goals.deleteGoal(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
