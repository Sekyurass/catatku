import { trackEventSchema } from '@catatku/shared';
import { Router } from 'express';
import { track } from '../../lib/analytics';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';

export function createEventsRouter() {
  const router = Router();
  router.post('/', (req, res) => {
    const { name, step, fields } = parse(trackEventSchema, req.body);
    const props = {
      ...(step !== undefined && { step }),
      ...(fields !== undefined && { fields }),
    };
    track(currentUserId(req), name, Object.keys(props).length > 0 ? props : undefined);
    res.status(204).end();
  });
  return router;
}
