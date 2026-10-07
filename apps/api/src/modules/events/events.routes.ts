import { trackEventSchema } from '@catatku/shared';
import { Router } from 'express';
import { track, type EventProps } from '../../lib/analytics';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';

export function createEventsRouter() {
  const router = Router();
  router.post('/', (req, res) => {
    const { name, ...rest } = parse(trackEventSchema, req.body);
    const props: EventProps = {};
    for (const [key, value] of Object.entries(rest)) if (value !== undefined) props[key] = value;
    track(currentUserId(req), name, Object.keys(props).length > 0 ? props : undefined);
    res.status(204).end();
  });
  return router;
}
