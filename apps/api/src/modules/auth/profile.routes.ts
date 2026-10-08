import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@catatku/shared';
import express, { Router } from 'express';
import { createAuthLimiter } from '../../middleware/rateLimit';
import * as ctrl from './auth.controller';

/** Profil pengguna yang sedang masuk. Dipasang di belakang requireAuth. */
export function createProfileRouter(opts: { rateLimit?: number } = {}) {
  const router = Router();
  const limiter = createAuthLimiter(opts.rateLimit);
  router.get('/', ctrl.me);
  router.patch('/', limiter, ctrl.updateProfile);
  router.delete('/', limiter, ctrl.deleteAccount);
  router.put('/password', limiter, ctrl.changePassword);
  router.put('/privacy', ctrl.agreePrivacy);
  router.get('/avatar', ctrl.getAvatar);
  router.put(
    '/avatar',
    express.raw({ type: [...AVATAR_MIME_TYPES], limit: AVATAR_MAX_BYTES }),
    ctrl.putAvatar,
  );
  router.delete('/avatar', ctrl.deleteAvatar);
  return router;
}
