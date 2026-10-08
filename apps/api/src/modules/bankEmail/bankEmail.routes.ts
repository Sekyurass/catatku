import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BANK_EMAIL_MAX_BYTES,
  confirmBankEmailSchema,
  FEATURE_FLAGS,
  idSchema,
  updateBankEmailSchema,
} from '@catatku/shared';
import express, { type NextFunction, type Request, type Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env';
import { notFound, unauthorized } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as service from './bankEmail.service';
import { pollImap } from './imap';

const rawEmail = express.raw({ type: () => true, limit: BANK_EMAIL_MAX_BYTES });
const CHECK_MIN_INTERVAL_MS = 4000;

/** Pengaturan, unggah .eml, dan antrean konfirmasi. Dipasang di belakang requireAuth. */
export function createBankEmailRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.BANK_EMAIL));

  router.get('/', async (req, res) => {
    res.json(await service.getInbox(currentUserId(req)));
  });

  router.put('/', async (req, res) => {
    const input = parse(updateBankEmailSchema, req.body);
    res.json(await service.updateInbox(currentUserId(req), input));
  });

  router.post('/address', async (req, res) => {
    res.json(await service.rotateAddress(currentUserId(req)));
  });

  // Dipanggil berkala oleh halaman selama pengguna menunggu kode konfirmasi penerusan Gmail.
  const checkLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    keyGenerator: (req) => currentUserId(req),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Terlalu sering memeriksa. Coba lagi nanti.' },
      });
    },
  });

  router.post('/check', checkLimiter, async (req, res) => {
    const userId = currentUserId(req);
    const inbox = await service.getInbox(userId);
    if (inbox.enabled && inbox.receiving) {
      await pollImap({ minIntervalMs: CHECK_MIN_INTERVAL_MS }).catch((err: unknown) =>
        logger.error({ err }, 'Gagal memeriksa kotak masuk IMAP'),
      );
      res.json(await service.getInbox(userId));
      return;
    }
    res.json(inbox);
  });

  router.post('/upload', rawEmail, async (req, res) => {
    res.json(await service.uploadEmail(currentUserId(req), req.body));
  });

  router.get('/pending', async (req, res) => {
    res.json({ items: await service.listPending(currentUserId(req)) });
  });

  router.post('/pending/:id/confirm', async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { transactionId } = parse(confirmBankEmailSchema, req.body);
    await service.confirmPending(currentUserId(req), id, transactionId);
    res.status(204).end();
  });

  router.post('/pending/:id/dismiss', async (req, res) => {
    await service.dismissPending(currentUserId(req), parse(idSchema, req.params.id));
    res.status(204).end();
  });

  return router;
}

const digest = (v: string) => createHash('sha256').update(v).digest();

function requireInboundSecret(req: Request, _res: Response, next: NextFunction) {
  if (!env.INBOUND_EMAIL_SECRET) throw notFound('Halaman');
  const given = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!timingSafeEqual(digest(given), digest(env.INBOUND_EMAIL_SECRET))) {
    throw unauthorized('Rahasia tidak valid');
  }
  next();
}

/**
 * Pintu masuk server-ke-server, tanpa sesi pengguna: webhook email (mis. Cloudflare Email Worker
 * mengirim email mentah + header X-Envelope-To) dan pemicu baca IMAP untuk cron eksternal.
 */
export function createInboundRouter() {
  const router = Router();
  router.use(requireInboundSecret);

  router.post('/email', rawEmail, async (req, res) => {
    const envelope = (req.get('x-envelope-to') ?? '').split(',').map((s) => s.trim());
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await service.receiveEmail(raw, envelope);
    res.status(202).json({ result: result ?? 'ignored' });
  });

  router.post('/poll', async (_req, res) => {
    res.json({ processed: await pollImap() });
  });

  return router;
}
