import {
  createDebtPaymentSchema,
  createDebtSchema,
  FEATURE_FLAGS,
  splitBillSchema,
  updateDebtSchema,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { requireFeature } from '../features/features.routes';
import * as debts from './debt.service';

export function createDebtsRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.DEBTS));

  router.get('/', async (req, res) => {
    res.json({ items: await debts.listDebts(currentUserId(req)) });
  });

  router.post('/', idempotent, async (req, res) => {
    const input = parse(createDebtSchema, req.body);
    res.status(201).json(await debts.createDebt(currentUserId(req), input));
  });

  router.post('/split', idempotent, async (req, res) => {
    const input = parse(splitBillSchema, req.body);
    res.status(201).json(await debts.splitBill(currentUserId(req), input));
  });

  router.delete('/payments/:id', async (req, res) => {
    res.json(await debts.deletePayment(currentUserId(req), req.params.id));
  });

  router.get('/:id', async (req, res) => {
    res.json(await debts.getDebt(currentUserId(req), req.params.id));
  });

  router.get('/:id/payments', async (req, res) => {
    res.json({ items: await debts.listPayments(currentUserId(req), req.params.id) });
  });

  router.post('/:id/payments', idempotent, async (req, res) => {
    const input = parse(createDebtPaymentSchema, req.body);
    const { id } = req.params as { id: string };
    res.status(201).json(await debts.createPayment(currentUserId(req), id, input));
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(updateDebtSchema, req.body);
    res.json(await debts.updateDebt(currentUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await debts.deleteDebt(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
