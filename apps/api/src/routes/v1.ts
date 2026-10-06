import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createApiLimiter } from '../middleware/rateLimit';
import { createAuthRouter } from '../modules/auth/auth.routes';
import { createCategoriesRouter } from '../modules/categories/category.routes';
import { createFeaturesRouter } from '../modules/features/features.routes';
import { createReportsRouter } from '../modules/reports/report.routes';
import { createTransactionsRouter } from '../modules/transactions/transaction.routes';
import { createWalletsRouter } from '../modules/wallets/wallet.routes';

export interface V1Options {
  authRateLimit?: number;
}

export function createV1Router(opts: V1Options = {}) {
  const router = Router();
  router.use(createApiLimiter());
  router.use('/auth', createAuthRouter({ rateLimit: opts.authRateLimit }));

  router.use(requireAuth);
  router.use('/features', createFeaturesRouter());
  router.use('/wallets', createWalletsRouter());
  router.use('/categories', createCategoriesRouter());
  router.use('/transactions', createTransactionsRouter());
  router.use('/reports', createReportsRouter());
  return router;
}
