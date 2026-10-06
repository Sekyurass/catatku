import {
  createTransactionSchema,
  createTransferSchema,
  listTransactionsQuery,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import * as txService from './transaction.service';

export function createTransactionsRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parse(listTransactionsQuery, req.query);
    res.json(await txService.listTransactions(currentUserId(req), query));
  });

  router.post('/', idempotent, async (req, res) => {
    const input = parse(createTransactionSchema, req.body);
    res.status(201).json(await txService.createTransaction(currentUserId(req), input));
  });

  router.post('/transfer', idempotent, async (req, res) => {
    const input = parse(createTransferSchema, req.body);
    res.status(201).json(await txService.createTransfer(currentUserId(req), input));
  });

  router.get('/:id', async (req, res) => {
    res.json(await txService.getTransaction(currentUserId(req), req.params.id));
  });

  router.patch('/:id', async (req, res) => {
    res.json(await txService.updateTransaction(currentUserId(req), req.params.id, req.body));
  });

  router.delete('/:id', async (req, res) => {
    await txService.deleteTransaction(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  router.post('/:id/restore', async (req, res) => {
    res.json(await txService.restoreTransaction(currentUserId(req), req.params.id));
  });

  return router;
}
