import { type CsvRow, parseAmountValue, parseCsv } from './csvImport';

/** Satu baris mutasi yang sudah dibaca. Nominal selalu positif; arah ada di `type`. */
export interface StatementEntry {
  /** Nomor baris di file, untuk menautkan keputusan pengguna ke baris yang sama. */
  line: number;
  date: string;
  /** true bila bank belum membukukannya ("PEND"): tanggal diperkirakan. */
  pending: boolean;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  /** Keterangan asli dari bank, spasi dirapikan. */
  description: string;
  /** Usulan catatan transaksi yang lebih mudah dibaca. */
  note: string;
  /** Tarik/setor tunai: biasanya dicatat sebagai transfer ke dompet tunai. */
  cash: boolean;
}

export interface ParsedStatement {
  bank: StatementBank;
  /** Nomor rekening yang disamarkan, mis. 1234****90. */
  accountHint: string | null;
  period: { from: string; to: string } | null;
  /** Saldo awal/akhir dari ringkasan bank; null bila file tidak memuatnya. */
  balance: { opening: number; closing: number } | null;
  entries: StatementEntry[];
  /** Baris tabel yang tidak terbaca (bukan baris ringkasan). */
  invalidLines: number[];
}

export const STATEMENT_BANKS = ['bca'] as const;
export type StatementBank = (typeof STATEMENT_BANKS)[number];
export const STATEMENT_BANK_NAMES: Record<StatementBank, string> = { bca: 'BCA' };

export interface StatementParser {
  bank: StatementBank;
  /** Cepat dan murah: dipanggil untuk setiap file yang diunggah ke halaman impor. */
  detect(text: string): boolean;
  parse(text: string, opts: { today: string }): ParsedStatement;
}

// ---------- BCA (KlikBCA / myBCA: "Mutasi Rekening" CSV) ----------

const clean = (v: string | undefined) =>
  (v ?? '')
    .replace(/^[\s'"]+|[\s'"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function isoFromDmy(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  return iso(Number(m[3]), Number(m[2]), Number(m[1]));
}

const validDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** BCA memakai titik desimal dan koma ribuan ("1,250,000.00"). */
const bcaAmount = (v: string) => {
  const n = parseAmountValue(v.replace(/\s*(DB|CR)\s*$/i, ''), 'dot');
  return n === null ? null : Math.round(Math.abs(n));
};

function maskAccount(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return `${digits.slice(0, 4)}${'*'.repeat(Math.max(digits.length - 6, 2))}${digits.slice(-2)}`;
}

/** Token sampah di keterangan BCA: kode tanggal/referensi ("0110/FTSCY/WS95051") dan nominal. */
const NOISE = /^(?:\d+(?:[./]\d+)*|[A-Z0-9]*\/[A-Z0-9/]*|\d{1,3}(?:,\d{3})*\.\d{2})$/i;

function words(rest: string): string {
  return rest
    .split(' ')
    .filter((w) => w && !NOISE.test(w))
    .join(' ')
    .trim();
}

/** Ubah keterangan BCA menjadi catatan yang ramah dibaca. */
export function bcaNote(description: string, type: 'INCOME' | 'EXPENSE'): string {
  const d = description.toUpperCase();
  const after = (prefix: RegExp) => words(description.replace(prefix, ''));
  const transfer = /^(TRSF E-BANKING|BI-FAST|SWITCHING|TRF|TRANSFER)\s+(DB|CR)?/i;
  if (transfer.test(d)) {
    const name = after(transfer).replace(/^(?:BIF\s+)?(?:TRANSFER\s+)?(?:KE|DARI)?\s*/i, '');
    const dir = type === 'INCOME' ? 'Transfer dari' : 'Transfer ke';
    return name ? `${dir} ${name}` : type === 'INCOME' ? 'Transfer masuk' : 'Transfer keluar';
  }
  if (/^TARIKAN ATM/.test(d)) return 'Tarik tunai ATM';
  if (/^SETORAN( TUNAI)?/.test(d)) return 'Setor tunai';
  if (/^PAJAK BUNGA/.test(d)) return 'Pajak bunga';
  if (/^BUNGA/.test(d)) return 'Bunga tabungan';
  if (/^BIAYA ADM/.test(d)) return 'Biaya administrasi';
  if (/^(KARTU DEBIT|DEBIT DOMESTIK|KARTU KREDIT)/.test(d)) {
    const rest = after(/^(KARTU DEBIT|DEBIT DOMESTIK|KARTU KREDIT)/i);
    return rest ? `Kartu debit: ${rest}` : 'Kartu debit';
  }
  if (/^(TRANSAKSI )?QRIS?\b/.test(d)) {
    const rest = after(/^(TRANSAKSI )?QRIS?\b/i);
    return rest ? `QRIS ${rest}` : 'Pembayaran QRIS';
  }
  if (/^KR OTOMATIS/.test(d)) {
    const rest = after(/^KR OTOMATIS( LLG-ANTAR BANK)?/i);
    return rest || 'Kredit otomatis';
  }
  return words(description) || description;
}

const CASH = /^(TARIKAN ATM|SETORAN( TUNAI)?)/i;

function findHeader(rows: CsvRow[]) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i]!.cells.map((c) => clean(c).toLowerCase());
    const date = cells.findIndex((c) => c.startsWith('tanggal'));
    const desc = cells.findIndex((c) => c.startsWith('keterangan'));
    const amount = cells.findIndex((c) => c === 'jumlah' || c.startsWith('mutasi'));
    if (date >= 0 && desc >= 0 && amount >= 0) {
      return { index: i, date, desc, amount, saldo: cells.findIndex((c) => c === 'saldo') };
    }
  }
  return null;
}

/** "Label : nilai" di kepala/ekor file; nilainya bisa di sel yang sama atau sel berikutnya. */
function labeled(rows: CsvRow[], label: RegExp): string | null {
  for (const r of rows) {
    const cells = r.cells.map(clean);
    const i = cells.findIndex((c) => label.test(c));
    if (i < 0) continue;
    const inline = cells[i]!.split(/\s*:\s*/)
      .slice(1)
      .join(':')
      .trim();
    const value = inline || cells.slice(i + 1).find((c) => c && c !== ':') || '';
    return value.replace(/^:\s*/, '').trim() || null;
  }
  return null;
}

export const bcaParser: StatementParser = {
  bank: 'bca',
  detect(text) {
    const head = text.slice(0, 8000).toLowerCase();
    return (
      /no\.?\s*rekening/.test(head) &&
      head.includes('tanggal transaksi') &&
      head.includes('keterangan') &&
      /\b(db|cr)\b/.test(head)
    );
  },
  parse(text, { today }) {
    const { rows } = parseCsv(text);
    const header = findHeader(rows);
    if (!header) {
      return {
        bank: 'bca',
        accountHint: null,
        period: null,
        balance: null,
        entries: [],
        invalidLines: [],
      };
    }
    const meta = rows.slice(0, header.index);
    const tail = rows.slice(header.index + 1);

    const periodRaw = labeled(meta, /^periode/i);
    const periodMatch =
      periodRaw && /(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(periodRaw);
    const from = periodMatch ? isoFromDmy(periodMatch[1]!) : null;
    const to = periodMatch ? isoFromDmy(periodMatch[2]!) : null;
    const period = from && to ? { from, to } : null;
    const account = labeled(meta, /^no\.?\s*rekening/i);

    const yearFor = (day: number, month: number): number => {
      if (period) {
        const [fy, fm] = [Number(period.from.slice(0, 4)), Number(period.from.slice(5, 7))];
        const ty = Number(period.to.slice(0, 4));
        return fy !== ty && month < fm ? ty : fy;
      }
      const y = Number(today.slice(0, 4));
      return iso(y, month, day) > today ? y - 1 : y;
    };

    const entries: StatementEntry[] = [];
    const invalidLines: number[] = [];
    let opening: number | null = null;
    let closing: number | null = null;

    for (const row of tail) {
      const cells = row.cells.map(clean);
      const first = (cells[0] ?? '').toLowerCase();
      if (!cells.some(Boolean)) continue;
      if (first.startsWith('saldo awal')) {
        opening = bcaAmount(cells.slice(1).find(Boolean) ?? first.split(':')[1] ?? '');
        continue;
      }
      if (first.startsWith('saldo akhir')) {
        closing = bcaAmount(cells.slice(1).find(Boolean) ?? first.split(':')[1] ?? '');
        continue;
      }
      if (first.startsWith('mutasi') || first.startsWith('total')) continue;

      const rawDate = (cells[header.date] ?? '').toUpperCase();
      const description = cells[header.desc] ?? '';
      const amountCell = cells[header.amount] ?? '';
      const amount = bcaAmount(amountCell);
      const dirCell = [amountCell, cells[header.amount + 1] ?? '']
        .join(' ')
        .match(/\b(DB|CR)\b/i)?.[1]
        ?.toUpperCase();
      const dir = dirCell ?? description.match(/\b(DB|CR)\b/i)?.[1]?.toUpperCase();

      let date: string | null = null;
      const pending = rawDate === 'PEND';
      if (pending) {
        date = period ? (period.to < today ? period.to : today) : today;
      } else {
        const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(rawDate);
        if (m) {
          const day = Number(m[1]);
          const month = Number(m[2]);
          const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : yearFor(day, month);
          const candidate = iso(year, month, day);
          date = validDate(candidate) ? candidate : null;
        }
      }

      if (!date || amount === null || amount === 0 || !dir || !description) {
        invalidLines.push(row.line);
        continue;
      }
      const type = dir === 'CR' ? 'INCOME' : 'EXPENSE';
      entries.push({
        line: row.line,
        date,
        pending,
        type,
        amount,
        description,
        note: bcaNote(description, type).slice(0, 200),
        cash: CASH.test(description),
      });
    }

    return {
      bank: 'bca',
      accountHint: account ? maskAccount(account) : null,
      period,
      balance: opening !== null && closing !== null ? { opening, closing } : null,
      entries,
      invalidLines,
    };
  },
};

export const STATEMENT_PARSERS: readonly StatementParser[] = [bcaParser];

export function detectStatement(text: string): StatementParser | null {
  return STATEMENT_PARSERS.find((p) => p.detect(text)) ?? null;
}

/** Saldo awal + mutasi = saldo akhir? Tanda file utuh (tidak ada baris yang hilang). */
export function statementBalanced(s: ParsedStatement): boolean | null {
  if (!s.balance || s.invalidLines.length > 0) return s.balance ? false : null;
  const net = s.entries.reduce((sum, e) => sum + (e.type === 'INCOME' ? e.amount : -e.amount), 0);
  return s.balance.opening + net === s.balance.closing;
}
