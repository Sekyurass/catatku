import { FEATURE_FLAGS, quickTextSampleSchema, quickTextSharingSchema } from '@catatku/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as service from './quickText.service';

/** Dataset ketikan cepat (opt-in). Bagian dari flag natural_input. */
export function createQuickTextRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.NATURAL_INPUT));

  router.get('/sharing', async (req, res) => {
    res.json({ enabled: await service.getSharing(currentUserId(req)) });
  });

  router.put('/sharing', async (req, res) => {
    const { enabled } = parse(quickTextSharingSchema, req.body);
    res.json({ enabled: await service.setSharing(currentUserId(req), enabled) });
  });

  // Sampel tidak menyimpan userId, jadi batas per pengguna dijaga di memori.
  const perUser = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    keyGenerator: (req) => currentUserId(req),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Terlalu banyak sampel. Coba lagi nanti.' },
      });
    },
  });

  router.post('/samples', perUser, async (req, res) => {
    const input = parse(quickTextSampleSchema, req.body);
    await service.addSample(currentUserId(req), input);
    res.status(204).end();
  });

  return router;
}
