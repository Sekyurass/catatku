import { trackEventSchema } from '@catatku/shared';
import { Router } from 'express';
import { track } from '../../lib/analytics';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';

export function createEventsRouter() {
  const router = Router();
  router.post('/', (req, res) => {
    const { name, step } = parse(trackEventSchema, req.body);
    track(currentUserId(req), name, step !== undefined ? { step } : undefined);
    res.status(204).end();
  });
  return router;
}
