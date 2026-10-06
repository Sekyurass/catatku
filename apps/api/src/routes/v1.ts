import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createApiLimiter } from '../middleware/rateLimit';
import { createAuthRouter } from '../modules/auth/auth.routes';
import { createFeaturesRouter } from '../modules/features/features.routes';

export interface V1Options {
  authRateLimit?: number;
}

export function createV1Router(opts: V1Options = {}) {
  const router = Router();
  router.use(createApiLimiter());
  router.use('/auth', createAuthRouter({ rateLimit: opts.authRateLimit }));

  router.use(requireAuth);
  router.use('/features', createFeaturesRouter());
  return router;
}
