import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BANK_EMAIL_MAX_BYTES,
  confirmBankEmailSchema,
  FEATURE_FLAGS,
  idSchema,
  updateBankEmailSchema,
} from '@catatku/shared';
import express, { type NextFunction, type Request, type Response, Router } from 'express';
import { env } from '../../config/env';
import { notFound, unauthorized } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as service from './bankEmail.service';
import { pollImap } from './imap';

const rawEmail = express.raw({ type: () => true, limit: BANK_EMAIL_MAX_BYTES });

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
