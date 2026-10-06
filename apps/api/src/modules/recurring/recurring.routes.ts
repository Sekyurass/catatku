import {
  confirmOccurrenceSchema,
  createRecurringSchema,
  FEATURE_FLAGS,
  updateRecurringSchema,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as recurring from './recurring.service';

export function createRecurringRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.RECURRING_TRANSACTIONS));

  router.get('/', async (req, res) => {
    res.json({ items: await recurring.listRules(currentUserId(req)) });
  });

  router.post('/', async (req, res) => {
    const input = parse(createRecurringSchema, req.body);
    res.status(201).json(await recurring.createRule(currentUserId(req), input));
  });

  router.get('/pending', async (req, res) => {
    res.json({ items: await recurring.listPending(currentUserId(req)) });
  });

  router.post('/pending/:id/confirm', async (req, res) => {
    const input = parse(confirmOccurrenceSchema, req.body ?? {});
    res.json(await recurring.confirmOccurrence(currentUserId(req), req.params.id, input));
  });

  router.post('/pending/:id/skip', async (req, res) => {
    await recurring.skipOccurrence(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(updateRecurringSchema, req.body);
    res.json(await recurring.updateRule(currentUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await recurring.deleteRule(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
