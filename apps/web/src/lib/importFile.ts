import {
  type CsvRow,
  detectDateOrder,
  detectDecimal,
  guessColumns,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportParseOptions,
  looksLikeHeader,
  parseAmountValue,
  parseCsv,
  parseDateValue,
} from '@catatku/shared';

export interface ImportDraft {
  filename: string;
  csv: string;
  rows: CsvRow[];
  /** Jumlah kolom terbanyak di contoh baris, untuk pilihan pemetaan. */
  width: number;
  options: ImportParseOptions;
}

export class ImportFileError extends Error {}

const SAMPLE = 50;

const isDate = (v: string) =>
  parseDateValue(v, 'DMY') !== null || parseDateValue(v, 'YMD') !== null;
const isAmount = (v: string) =>
  parseAmountValue(v, 'comma') !== null || parseAmountValue(v, 'dot') !== null;

/** Tebakan awal pemetaan: dari judul kolom bila ada, kalau tidak dari isi baris. */
export function detectOptions(rows: CsvRow[], hasHeader: boolean): ImportParseOptions {
  const data = rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + SAMPLE);
  const width = Math.max(1, ...rows.slice(0, SAMPLE).map((r) => r.cells.length));
  const values = (i: number) => data.map((r) => r.cells[i] ?? '').filter(Boolean);
  const indexes = Array.from({ length: width }, (_, i) => i);
  const guessed = hasHeader ? guessColumns(rows[0]!.cells) : {};

  const date = guessed.date ?? indexes.find((i) => values(i).some(isDate)) ?? 0;
  const amount =
    guessed.amount ??
    indexes.find((i) => i !== date && values(i).length > 0 && values(i).every(isAmount)) ??
    Math.min(1, width - 1);
  const note = hasHeader
    ? (guessed.note ?? null)
    : (indexes.find(
        (i) => i !== date && i !== amount && values(i).some((v) => /[a-z]/i.test(v) && !isDate(v)),
      ) ?? null);

  return {
    hasHeader,
    columns: {
      date,
      amount,
      note,
      type: guessed.type ?? null,
      category: guessed.category ?? null,
    },
    dateOrder: detectDateOrder(values(date)),
    decimal: detectDecimal(values(amount)),
    defaultType: 'SIGN',
  };
}

export async function readImportFile(file: File): Promise<ImportDraft> {
  if (!/\.(csv|txt)$/i.test(file.name)) {
    throw new ImportFileError('Pilih file berformat CSV (.csv).');
  }
  if (file.size > IMPORT_MAX_BYTES) {
    throw new ImportFileError('File terlalu besar (maks. 1 MB). Pecah per beberapa bulan dulu.');
  }
  const csv = await file.text();
  const { rows } = parseCsv(csv);
  if (rows.length === 0) throw new ImportFileError('File kosong.');
  const hasHeader = looksLikeHeader(rows[0]!.cells);
  const dataRows = rows.length - (hasHeader ? 1 : 0);
  if (dataRows === 0) throw new ImportFileError('File hanya berisi judul kolom, belum ada data.');
  if (dataRows > IMPORT_MAX_ROWS) {
    throw new ImportFileError(
      `File berisi ${dataRows.toLocaleString('id-ID')} baris. Maksimal ${IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris per impor.`,
    );
  }
  return {
    filename: file.name,
    csv,
    rows,
    width: Math.max(...rows.slice(0, SAMPLE).map((r) => r.cells.length)),
    options: detectOptions(rows, hasHeader),
  };
}

export function columnLabel(draft: ImportDraft, index: number, hasHeader: boolean): string {
  const title = hasHeader ? draft.rows[0]?.cells[index] : '';
  return title || `Kolom ${index + 1}`;
}

export const dataRowCount = (draft: ImportDraft, hasHeader: boolean) =>
  draft.rows.length - (hasHeader ? 1 : 0);
