import {
  currentMonth,
  exportTransactionsQuery,
  FEATURE_FLAGS,
  reportMonthQuery,
  shiftMonth,
  toDateString,
} from '@catatku/shared';
import { Router } from 'express';
import { track } from '../../lib/analytics';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import { getCompare, getMonthlyReport } from '../reports/report.service';
import { CSV_HEADER, transactionCsvChunks } from './export.service';
import { renderMonthlyPdf } from './reportPdf';

export function createExportRouter() {
  const router = Router();

  router.get('/transactions.csv', async (req, res) => {
    const query = parse(exportTransactionsQuery, req.query);
    const userId = currentUserId(req);
    const filename = `catatku-transaksi-${toDateString()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    // BOM agar Excel membaca UTF-8 dengan benar (nama/catatan beraksen, emoji).
    res.write(`\uFEFF${CSV_HEADER}`);
    for await (const chunk of transactionCsvChunks(userId, query)) {
      if (chunk) res.write(chunk);
    }
    res.end();
    track(userId, 'export_csv');
  });

  router.get('/report.pdf', requireFeature(FEATURE_FLAGS.ADVANCED_REPORTS), async (req, res) => {
    const { month = currentMonth() } = parse(reportMonthQuery, req.query);
    const userId = currentUserId(req);
    const [user, report, compare] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      getMonthlyReport(userId, month),
      getCompare(userId, shiftMonth(month, -1), month, 'EXPENSE'),
    ]);
    const pdf = await renderMonthlyPdf({ userName: user.name, report, compare });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="catatku-laporan-${month}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
    track(userId, 'export_pdf');
  });

  return router;
}
