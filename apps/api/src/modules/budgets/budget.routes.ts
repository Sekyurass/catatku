import { budgetMonthQuery, createCustomBudgetSchema, putBudgetsSchema } from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import * as budgetService from './budget.service';

export function createBudgetsRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const { month } = parse(budgetMonthQuery, req.query);
    res.json(await budgetService.getBudgets(currentUserId(req), month));
  });

  router.put('/', async (req, res) => {
    const input = parse(putBudgetsSchema, req.body);
    res.json(await budgetService.putBudgets(currentUserId(req), input));
  });

  router.post('/custom', idempotent, async (req, res) => {
    const input = parse(createCustomBudgetSchema, req.body);
    res.status(201).json(await budgetService.createCustomBudget(currentUserId(req), input));
  });

  return router;
}
