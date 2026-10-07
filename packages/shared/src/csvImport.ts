import { MAX_AMOUNT } from './constants';
import type { DateOrder, DecimalSeparator, ImportParseOptions } from './schemas/import';

export interface CsvRow {
  /** Nomor baris di file (1 = baris pertama), untuk laporan "baris ke-N". */
  line: number;
  cells: string[];
}

const DELIMITERS = [',', ';', '\t', '|'] as const;

/** Pemisah yang paling sering muncul di baris pertama (di luar tanda kutip). Excel Indonesia memakai `;`. */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>();
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && (DELIMITERS as readonly string[]).includes(ch)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  let best = ',';
  let max = 0;
  for (const d of DELIMITERS) {
    if ((counts.get(d) ?? 0) > max) {
      best = d;
      max = counts.get(d)!;
    }
  }
  return best;
}

/** Ekspor Catatku memberi awalan `'` pada teks berawalan karakter formula; dibuang lagi di sini. */
const cleanCell = (cell: string) => {
  const trimmed = cell.trim();
  return /^'[=+\-@]/.test(trimmed) ? trimmed.slice(1) : trimmed;
};

/** CSV RFC 4180: kutip ganda, sel multi-baris, CRLF/LF, BOM. Baris kosong dibuang. */
export function parseCsv(text: string): { rows: CsvRow[]; delimiter: string } {
  const src = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(src);
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== ''))
      rows.push({ line: rowLine, cells: cells.map(cleanCell) });
    cells = [];
    cell = '';
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return { rows, delimiter };
}

// ---------- Tanggal ----------

const NUMERIC_DATE = /^(\d{1,4})[/\-. ](\d{1,2})[/\-. ](\d{1,4})(?:$|[\sT])/;
const NAMED_DATE = /^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})\.?[\s\-/.,]+(\d{2}|\d{4})(?:$|[\sT])/;

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  agt: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
};

function toIsoDate(y: number, m: number, d: number): string | null {
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

const fullYear = (raw: string) => (raw.length === 2 ? 2000 + Number(raw) : Number(raw));

/** "07/10/2026", "2026-10-07", "7 Okt 2026", "07-Oct-26" → "2026-10-07"; null bila tidak valid. */
export function parseDateValue(raw: string, order: DateOrder): string | null {
  const value = raw.trim();
  const named = NAMED_DATE.exec(value);
  if (named) {
    const month = MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    return month ? toIsoDate(fullYear(named[3]!), month, Number(named[1])) : null;
  }
  const m = NUMERIC_DATE.exec(value);
  if (!m) return null;
  const [a, b, c] = [m[1]!, m[2]!, m[3]!];
  const [y, mo, d] = order === 'YMD' ? [a, b, c] : order === 'DMY' ? [c, b, a] : [c, a, b];
  if (y.length === 3 || y.length === 1 || d.length > 2) return null;
  return toIsoDate(fullYear(y), Number(mo), Number(d));
}

/** Tebak urutan tanggal dari contoh nilai; standar Indonesia (hari dulu) bila tidak jelas. */
export function detectDateOrder(values: string[]): DateOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const v of values) {
    const m = NUMERIC_DATE.exec(v.trim());
    if (!m) continue;
    if (m[1]!.length === 4) return 'YMD';
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  return monthFirst && !dayFirst ? 'MDY' : 'DMY';
}

// ---------- Jumlah ----------

/**
 * Nominal bertanda dalam Rupiah utuh (dibulatkan). Mendukung "Rp", tanda minus di depan/belakang,
 * kurung akuntansi, dan pemisah ribuan yang harus berkelompok 3 digit; null bila tidak terbaca.
 */
export function parseAmountValue(raw: string, decimal: DecimalSeparator): number | null {
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/rp\.?|idr/gi, '').replace(/\s/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  const [group, dec] = decimal === 'comma' ? ['.', ','] : [',', '.'];
  const esc = (c: string) => `\\${c}`;
  const pattern = new RegExp(`^(\\d+|\\d{1,3}(?:${esc(group)}\\d{3})+)(?:${esc(dec)}(\\d+))?$`);
  const m = pattern.exec(s);
  if (!m) return null;
  const n = Math.round(Number(`${m[1]!.split(group).join('')}.${m[2] ?? '0'}`));
  return negative && n !== 0 ? -n : n;
}

/** Tebak pemisah desimal: koma bila ada nilai seperti "1.500.000" atau "18.000,50". */
export function detectDecimal(values: string[]): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    if (parseAmountValue(v, 'comma') !== null) comma++;
    if (parseAmountValue(v, 'dot') !== null) dot++;
  }
  return dot > comma ? 'dot' : 'comma';
}

// ---------- Tipe ----------

const INCOME_WORDS = new Set(['masuk', 'income', 'kredit', 'credit', 'cr', 'k', 'in', '+']);
const EXPENSE_WORDS = new Set(['keluar', 'expense', 'debit', 'debet', 'db', 'dr', 'd', 'out', '-']);

export function parseTypeValue(raw: string): 'INCOME' | 'EXPENSE' | 'TRANSFER' | null {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('transfer')) return 'TRANSFER';
  if (v.startsWith('pemasukan') || INCOME_WORDS.has(v)) return 'INCOME';
  if (v.startsWith('pengeluaran') || EXPENSE_WORDS.has(v)) return 'EXPENSE';
  return null;
}

// ---------- Pemetaan kolom ----------

export type ImportColumns = ImportParseOptions['columns'];

const HEADER_PATTERNS: Array<[keyof ImportColumns, RegExp]> = [
  ['date', /tanggal|tgl|date|waktu/i],
  ['type', /jenis|tipe|type|db\s*\/\s*cr|d\s*\/\s*k/i],
  ['category', /kategori|category/i],
  ['amount', /jumlah|nominal|amount|nilai|mutasi|total/i],
  ['note', /catatan|keterangan|deskripsi|description|note|memo|uraian/i],
];

/** Pemetaan awal dari judul kolom; satu kolom hanya dipakai sekali. */
export function guessColumns(header: string[]): Partial<ImportColumns> {
  const used = new Set<number>();
  const out: Partial<ImportColumns> = {};
  for (const [field, pattern] of HEADER_PATTERNS) {
    const index = header.findIndex((h, i) => !used.has(i) && pattern.test(h));
    if (index >= 0) {
      out[field] = index;
      used.add(index);
    }
  }
  return out;
}

/** Baris pertama dianggap judul bila tidak ada satu sel pun yang terbaca sebagai tanggal. */
export function looksLikeHeader(cells: string[]): boolean {
  return !cells.some((c) => parseDateValue(c, 'DMY') !== null || parseDateValue(c, 'YMD') !== null);
}

// ---------- Baris impor ----------

export type ImportRowResult =
  | {
      line: number;
      ok: true;
      date: string;
      type: 'INCOME' | 'EXPENSE';
      /** Selalu positif. */
      amount: number;
      note: string | null;
      /** Nama kategori apa adanya dari file; dicocokkan di server. */
      category: string | null;
    }
  | { line: number; ok: false; reason: string };

const quote = (raw: string) => `"${raw.length > 30 ? `${raw.slice(0, 30)}…` : raw}"`;

/** Ubah baris CSV menjadi calon transaksi, atau alasan kenapa baris itu gagal. */
export function buildImportRows(rows: CsvRow[], options: ImportParseOptions): ImportRowResult[] {
  const { columns, dateOrder, decimal, defaultType } = options;
  const data = options.hasHeader ? rows.slice(1) : rows;
  return data.map(({ line, cells }): ImportRowResult => {
    const fail = (reason: string) => ({ line, ok: false as const, reason });
    const get = (i: number | null) => (i === null ? '' : (cells[i] ?? ''));

    const rawDate = get(columns.date);
    if (!rawDate) return fail('Tanggal kosong');
    const date = parseDateValue(rawDate, dateOrder);
    if (!date) return fail(`Tanggal ${quote(rawDate)} tidak sesuai format`);

    const rawAmount = get(columns.amount);
    if (!rawAmount) return fail('Jumlah kosong');
    const signed = parseAmountValue(rawAmount, decimal);
    if (signed === null) return fail(`Jumlah ${quote(rawAmount)} tidak terbaca`);
    if (signed === 0) return fail('Jumlah 0');
    const amount = Math.abs(signed);
    if (amount > MAX_AMOUNT) return fail('Jumlah terlalu besar');

    let type: 'INCOME' | 'EXPENSE';
    if (columns.type !== null) {
      const rawType = get(columns.type);
      const parsed = parseTypeValue(rawType);
      if (parsed === 'TRANSFER') return fail('Transfer antardompet belum bisa diimpor');
      if (!parsed) return fail(rawType ? `Tipe ${quote(rawType)} tidak dikenali` : 'Tipe kosong');
      type = parsed;
    } else if (defaultType === 'SIGN') {
      type = signed < 0 ? 'EXPENSE' : 'INCOME';
    } else {
      type = defaultType;
    }

    const note = get(columns.note).replace(/\s+/g, ' ').slice(0, 200) || null;
    const category = get(columns.category) || null;
    return { line, ok: true, date, type, amount, note, category };
  });
}
