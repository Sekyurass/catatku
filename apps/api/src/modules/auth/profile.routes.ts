import { Router } from 'express';
import { createAuthLimiter } from '../../middleware/rateLimit';
import * as ctrl from './auth.controller';

/** Profil pengguna yang sedang masuk. Dipasang di belakang requireAuth. */
export function createProfileRouter(opts: { rateLimit?: number } = {}) {
  const router = Router();
  const limiter = createAuthLimiter(opts.rateLimit);
  router.get('/', ctrl.me);
  router.patch('/', limiter, ctrl.updateProfile);
  router.put('/password', limiter, ctrl.changePassword);
  return router;
}
