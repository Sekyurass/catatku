import type { ExportTransactionsQuery, TransactionDTO } from '@catatku/shared';
import { csvRow } from '../../lib/csv';
import { listTransactions } from '../transactions/transaction.service';

const BATCH_SIZE = 500;

export const CSV_HEADER = csvRow([
  'Tanggal',
  'Jenis',
  'Kategori',
  'Dompet',
  'Dompet lawan',
  'Jumlah',
  'Catatan',
  'Tag',
]);

function typeLabel(tx: TransactionDTO): string {
  if (tx.type === 'INCOME') return 'Pemasukan';
  if (tx.type === 'EXPENSE') return 'Pengeluaran';
  return tx.amount < 0 ? 'Transfer keluar' : 'Transfer masuk';
}

/** Jumlah tetap bertanda (− keluar, + masuk) sebagai bilangan bulat Rupiah. */
export function toCsvRow(tx: TransactionDTO): string {
  return csvRow([
    tx.date,
    typeLabel(tx),
    tx.category?.name ?? '',
    tx.wallet.name,
    tx.counterpartWallet?.name ?? '',
    tx.amount,
    tx.note ?? '',
    tx.tags.map((t) => t.name).join(', '),
  ]);
}

/** Baris CSV per batch (urut terbaru dulu), agar ekspor besar tidak dimuat sekaligus ke memori. */
export async function* transactionCsvChunks(
  userId: string,
  query: ExportTransactionsQuery,
): AsyncGenerator<string> {
  let cursor: string | undefined;
  do {
    const page = await listTransactions(userId, { ...query, cursor, limit: BATCH_SIZE });
    yield page.items.map(toCsvRow).join('');
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}
