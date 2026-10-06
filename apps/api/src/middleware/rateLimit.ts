import type { ApiErrorBody } from '@catatku/shared';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

const tooMany: ApiErrorBody = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
  },
};

/** Untuk login & daftar: membatasi tebakan kata sandi per IP. */
export function createAuthLimiter(limit = env.AUTH_RATE_LIMIT) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json(tooMany),
  });
}

export function createApiLimiter(limit = 300) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json(tooMany),
  });
}
