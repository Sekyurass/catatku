import { Router } from 'express';
import { createAuthLimiter } from '../../middleware/rateLimit';
import * as ctrl from './auth.controller';

export function createAuthRouter(opts: { rateLimit?: number } = {}) {
  const router = Router();
  const limiter = createAuthLimiter(opts.rateLimit);
  router.post('/register', limiter, ctrl.register);
  router.post('/login', limiter, ctrl.login);
  router.post('/refresh', ctrl.refresh);
  router.post('/logout', ctrl.logout);
  return router;
}
