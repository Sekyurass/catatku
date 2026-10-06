import type { FeatureFlagKey } from '@catatku/shared';
import { type NextFunction, type Request, type Response, Router } from 'express';
import { notFound } from '../../lib/errors';
import { currentUserId } from '../../middleware/auth';
import { getFlagsForUser, isFeatureEnabled } from './featureFlag.service';

export function createFeaturesRouter() {
  const router = Router();
  router.get('/', async (req, res) => {
    res.json({ flags: await getFlagsForUser(currentUserId(req)) });
  });
  return router;
}

/** Sembunyikan endpoint fitur yang belum aktif untuk pengguna ini (404). */
export function requireFeature(key: FeatureFlagKey) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!(await isFeatureEnabled(key, currentUserId(req)))) throw notFound('Fitur');
    next();
  };
}
