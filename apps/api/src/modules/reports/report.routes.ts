import {
  FEATURE_FLAGS,
  reportByCategoryQuery,
  reportMonthQuery,
  reportTrendQuery,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import { getByTag } from '../tags/tag.service';
import * as reportService from './report.service';

export function createReportsRouter() {
  const router = Router();

  router.get('/summary', async (req, res) => {
    const { month } = parse(reportMonthQuery, req.query);
    res.json(await reportService.getSummary(currentUserId(req), month));
  });

  router.get('/by-category', async (req, res) => {
    const { month, type } = parse(reportByCategoryQuery, req.query);
    res.json(await reportService.getByCategory(currentUserId(req), type, month));
  });

  router.get('/by-tag', requireFeature(FEATURE_FLAGS.TAGS), async (req, res) => {
    const { month, type } = parse(reportByCategoryQuery, req.query);
    res.json(await getByTag(currentUserId(req), type, month));
  });

  router.get('/trend', async (req, res) => {
    const { months } = parse(reportTrendQuery, req.query);
    res.json(await reportService.getTrend(currentUserId(req), months));
  });

  return router;
}
