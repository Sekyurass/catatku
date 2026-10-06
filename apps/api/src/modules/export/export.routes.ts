import { exportTransactionsQuery, toDateString } from '@catatku/shared';
import { Router } from 'express';
import { track } from '../../lib/analytics';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { CSV_HEADER, transactionCsvChunks } from './export.service';

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

  return router;
}
