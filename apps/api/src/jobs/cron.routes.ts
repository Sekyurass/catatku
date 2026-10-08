import { createHash, timingSafeEqual } from 'node:crypto';
import { type NextFunction, type Request, type Response, Router } from 'express';
import { env } from '../config/env';
import { notFound } from '../lib/errors';
import { runNotifications, runRecurring } from './runners';

const digest = (v: string) => createHash('sha256').update(v).digest();

/** Tanpa CRON_SECRET atau dengan rahasia salah, endpoint berpura-pura tidak ada. */
function requireCronSecret(req: Request, _res: Response, next: NextFunction) {
  const given = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!env.CRON_SECRET || !timingSafeEqual(digest(given), digest(env.CRON_SECRET))) {
    throw notFound('Halaman');
  }
  next();
}

/**
 * Pengganti node-cron untuk hosting serverless: dipanggil tiap jam oleh Supabase pg_cron + pg_net.
 * Semua job idempoten, jadi panggilan ganda atau susulan aman.
 */
export function createCronRouter() {
  const router = Router();
  router.use(requireCronSecret);

  router.post('/recurring', async (_req, res) => {
    res.json(await runRecurring());
  });

  router.post('/reminders', async (_req, res) => {
    res.json(await runNotifications());
  });

  return router;
}
