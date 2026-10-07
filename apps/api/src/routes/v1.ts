import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createApiLimiter } from '../middleware/rateLimit';
import { createAttachmentsRouter } from '../modules/attachments/attachment.routes';
import { createAuthRouter } from '../modules/auth/auth.routes';
import { createProfileRouter } from '../modules/auth/profile.routes';
import { createBudgetsRouter } from '../modules/budgets/budget.routes';
import { createCategoriesRouter } from '../modules/categories/category.routes';
import { createEventsRouter } from '../modules/events/events.routes';
import { createExportRouter } from '../modules/export/export.routes';
import { createFeaturesRouter } from '../modules/features/features.routes';
import { createGoalsRouter } from '../modules/goals/goal.routes';
import { createImportsRouter } from '../modules/imports/import.routes';
import { createInsightsRouter } from '../modules/insights/insight.routes';
import { createNotificationsRouter } from '../modules/notifications/notification.routes';
import { createRecurringRouter } from '../modules/recurring/recurring.routes';
import { createReportsRouter } from '../modules/reports/report.routes';
import { createTagsRouter } from '../modules/tags/tag.routes';
import { createTemplatesRouter } from '../modules/templates/template.routes';
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
  router.use('/me', createProfileRouter({ rateLimit: opts.authRateLimit }));
  router.use('/features', createFeaturesRouter());
  router.use('/wallets', createWalletsRouter());
  router.use('/categories', createCategoriesRouter());
  router.use('/transactions', createTransactionsRouter());
  router.use('/reports', createReportsRouter());
  router.use('/budgets', createBudgetsRouter());
  router.use('/export', createExportRouter());
  router.use('/events', createEventsRouter());
  router.use('/recurring', createRecurringRouter());
  router.use('/notifications', createNotificationsRouter());
  router.use('/templates', createTemplatesRouter());
  router.use('/imports', createImportsRouter());
  router.use('/tags', createTagsRouter());
  router.use('/goals', createGoalsRouter());
  router.use('/insights', createInsightsRouter());
  router.use(createAttachmentsRouter());
  return router;
}
