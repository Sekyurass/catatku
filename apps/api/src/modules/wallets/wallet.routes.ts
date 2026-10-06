import { createWalletSchema, updateWalletSchema } from '@catatku/shared';
import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import * as walletService from './wallet.service';

const listQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export function createWalletsRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const { includeArchived } = parse(listQuery, req.query);
    res.json({ items: await walletService.listWallets(currentUserId(req), includeArchived) });
  });

  router.get('/:id', async (req, res) => {
    res.json(await walletService.getWallet(currentUserId(req), req.params.id));
  });

  router.post('/', async (req, res) => {
    const input = parse(createWalletSchema, req.body);
    res.status(201).json(await walletService.createWallet(currentUserId(req), input));
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(updateWalletSchema, req.body);
    res.json(await walletService.updateWallet(currentUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    const result = await walletService.deleteWallet(currentUserId(req), req.params.id);
    res.json({ result });
  });

  return router;
}
