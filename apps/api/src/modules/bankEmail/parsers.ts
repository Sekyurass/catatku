import type { BankEmailKind } from '@catatku/shared';

export interface EmailContent {
  /** Domain alamat From, huruf kecil. */
  fromDomain: string;
  subject: string;
  /** Isi teks; untuk email HTML saja, hasil konversi HTML ke teks. */
  text: string;
}

export interface ParsedBankEmail {
  /** "bca", atau domain pengirim untuk pembaca umum. */
  source: string;
  kind: BankEmailKind;
  type: 'INCOME' | 'EXPENSE';
  /** Rupiah utuh, positif, sudah termasuk biaya. */
  amount: number;
  fee: number;
  /** null = pakai tanggal email. */
  date: string | null;
  time: string | null;
  counterparty: string | null;
  /** null = pakai Message-ID sebagai kunci anti-ganda. */
  reference: string | null;
  accountHint: string | null;
  note: string;
  confident: boolean;
}

const AMOUNT_TOTAL_LABELS = [
  'total bayar',
  'total payment',
  'total pembayaran',
  'total transaksi',
  'total amount',
  'total',
];
const AMOUNT_LABELS = [
  'nominal tujuan',
  'amount',
  'nominal',
  'jumlah',
  'transfer amount',
  'payment amount',
  'nominal transfer',
  'jumlah transfer',
  'nominal pembayaran',
  'jumlah pembayaran',
  'nominal transaksi',
];
const FEE_LABELS = ['transfer fee', 'biaya transfer', 'biaya admin', 'admin fee', 'fee', 'biaya'];
const DATE_LABELS = [
  'transaction date',
  'tanggal transaksi',
  'waktu transaksi',
  'transaction time',
  'tanggal',
  'date',
];
const REFERENCE_LABELS = [
  'reference no',
  'reference number',
  'no referensi',
  'nomor referensi',
  'no ref',
  'ref no',
  'reference',
  'referensi',
  'transaction id',
  'id transaksi',
];
const COUNTERPARTY_LABELS = [
  'merchant name',
  'nama merchant',
  'merchant',
  'beneficiary name',
  'nama penerima',
  'receiver name',
  'penerima',
  'payment to',
  'pembayaran ke',
  'biller name',
  'nama biller',
  'sender name',
  'nama pengirim',
];
const MEMO_LABELS = ['berita', 'keterangan', 'remark', 'remarks', 'description'];
const STATUS_LABELS = ['status', 'status transaksi', 'transaction status'];
const FAILED_RE = /gagal|failed|ditolak|rejected|dibatalkan|cancel/i;
const ACCOUNT_LABELS = [
  'source of fund',
  'sumber dana',
  'source account',
  'rekening sumber',
  'from account',
  'dari rekening',
];

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  agt: 8,
  ags: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
  december: 12,
};

/** "IDR 150,000.00", "Rp 150.000,00", "Rp25.000,-" → 150000 / 25000. */
export function parseRupiah(raw: string): number | null {
  const m = raw.replace(/\s/g, '').match(/(?:rp\.?|idr)?(\d[\d.,]*)/i);
  if (!m) return null;
  const digits = m[1]!
    .replace(/[.,]-?$/, '')
    .replace(/[.,]\d{1,2}$/, '')
    .replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Tanggal & jam dari teks bebas: "08 Oct 2026 10:15:22", "08/10/2026 10.15", "2026-10-08". */
export function parseDateTime(raw: string): { date: string | null; time: string | null } {
  const text = raw.toLowerCase();
  let date: string | null = null;
  let rest = text;
  const named = text.match(/\b(\d{1,2})[\s-]+([a-z]{3,9})\.?[\s-]+(\d{4})\b/);
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
  if (named && MONTHS[named[2]!]) {
    date = validDate(Number(named[3]), MONTHS[named[2]!]!, Number(named[1]));
    rest = text.slice(named.index! + named[0].length);
  } else if (iso) {
    date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    rest = text.slice(iso.index! + iso[0].length);
  } else if (numeric) {
    date = validDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    rest = text.slice(numeric.index! + numeric[0].length);
  }
  const t = rest.match(/\b(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\b/);
  const time = t && Number(t[1]) < 24 && Number(t[2]) < 60 ? `${pad(Number(t[1]))}:${t[2]}` : null;
  return { date, time };
}

const normLabel = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LABEL_RE = /^([a-z][a-z ./()&-]{1,40}?)\s*:\s*(.*)$/i;
const TABLE_RE = /^([a-z][a-z ./()&-]{1,40}?)(?:\t|\s{2,})(\S.*)$/i;

/** Pasangan "Label : Nilai" (atau label & nilai di baris/kolom berbeda) → Map label ternormalisasi. */
export function extractFields(text: string): Map<string, string> {
  const known = new Set(
    [
      ...AMOUNT_TOTAL_LABELS,
      ...AMOUNT_LABELS,
      ...FEE_LABELS,
      ...DATE_LABELS,
      ...REFERENCE_LABELS,
      ...COUNTERPARTY_LABELS,
      ...MEMO_LABELS,
      ...STATUS_LABELS,
      ...ACCOUNT_LABELS,
    ].map(normLabel),
  );
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
  const fields = new Map<string, string>();
  const set = (label: string, value: string) => {
    const key = normLabel(label);
    const v = value.replace(/^:\s*/, '').trim();
    if (key && v && !fields.has(key)) fields.set(key, v);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1] ?? '';
    const labeled = line.match(LABEL_RE) ?? line.match(TABLE_RE);
    if (labeled) {
      const value = labeled[2]!.trim();
      if (value) set(labeled[1]!, value);
      else if (next) set(labeled[1]!, next);
      continue;
    }
    if (known.has(normLabel(line)) && next) set(line, next);
  }
  return fields;
}

function pick(fields: Map<string, string>, labels: string[]): string | null {
  for (const label of labels) {
    const v = fields.get(normLabel(label));
    if (v) return v;
  }
  for (const label of labels) {
    const key = normLabel(label);
    for (const [k, v] of fields) if (k.startsWith(`${key} `)) return v;
  }
  return null;
}

/** Nomor rekening/kartu yang belum disamarkan bank: sisakan 4 digit awal & 2 akhir. */
export function maskAccount(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return value.replace(
    /\d{7,}/g,
    (d) => `${d.slice(0, 4)}${'*'.repeat(d.length - 6)}${d.slice(-2)}`,
  );
}

const cleanName = (raw: string | null) => {
  const v = raw?.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, 60) : null;
};

function detectKind(haystack: string): BankEmailKind {
  if (/\bqris\b/.test(haystack)) return 'qris';
  if (/transfer|pemindahan dana|\btrf\b/.test(haystack)) return 'transfer';
  if (/payment|pembayaran|purchase|pembelian|top ?up|isi ulang|debit/.test(haystack)) {
    return 'payment';
  }
  return 'generic';
}

const INCOME_RE =
  /dana masuk|transfer masuk|uang masuk|incoming|credited|dikreditkan|received from|menerima transfer|terima transfer/;
const TRANSACTION_RE = /transaksi|transaction|transfer|pembayaran|payment|qris|debit|kredit/;

function baseNote(
  kind: BankEmailKind,
  type: 'INCOME' | 'EXPENSE',
  who: string | null,
  subject: string,
) {
  if (kind === 'transfer' && who)
    return `${type === 'INCOME' ? 'Transfer dari' : 'Transfer ke'} ${who}`;
  if (who) return who;
  if (kind === 'qris') return 'Pembayaran QRIS';
  return subject.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Transaksi dari email bank';
}

function noteFor(
  kind: BankEmailKind,
  type: 'INCOME' | 'EXPENSE',
  who: string | null,
  subject: string,
  memo: string | null,
) {
  const note = baseNote(kind, type, who, subject);
  const extra = memo?.replace(/\s+/g, ' ').trim();
  return (extra && extra !== '-' ? `${note} · ${extra}` : note).slice(0, 120);
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** HTML email → teks: sel tabel dipisah tab, baris/blok jadi baris baru. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<br\s*\/?>|<\/(tr|p|div|li|h[1-6]|table)>|<p\s*\/>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? m;
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    })
    .split('\n')
    .map((line) =>
      line
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]*\t[ \t]*/g, '\t')
        .replace(/ {2,}/g, ' ')
        .replace(/^\t+|\t+$/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * Membaca satu email notifikasi bank. BCA dibaca dengan label-labelnya; bank lain dengan pembaca
 * umum (confident=false, pengguna diminta mengecek). null = bukan email transaksi / tidak terbaca.
 */
export function parseBankEmail(email: EmailContent): ParsedBankEmail | null {
  const isBca = email.fromDomain === 'bca.co.id' || email.fromDomain.endsWith('.bca.co.id');
  const fields = extractFields(email.text);
  const haystack = `${email.subject}\n${email.text}`.toLowerCase();
  const status = pick(fields, STATUS_LABELS);
  if (status && FAILED_RE.test(status)) return null;

  const totalRaw = pick(fields, AMOUNT_TOTAL_LABELS);
  const amountRaw = pick(fields, AMOUNT_LABELS);
  const feeRaw = pick(fields, FEE_LABELS);
  const total = totalRaw ? parseRupiah(totalRaw) : null;
  const base = amountRaw ? parseRupiah(amountRaw) : null;
  let fee = feeRaw ? (parseRupiah(feeRaw) ?? 0) : 0;
  let amount = total ?? (base !== null ? base + fee : null);
  if (total !== null && base !== null && !feeRaw && total > base) fee = total - base;

  if (amount === null) {
    if (isBca || !TRANSACTION_RE.test(haystack)) return null;
    const loose = email.text.match(/(?:rp\.?|idr)\s?\d[\d.,]*/i);
    amount = loose ? parseRupiah(loose[0]) : null;
    if (amount === null) return null;
    fee = 0;
  }
  if (fee >= amount) fee = 0;

  const when = parseDateTime(pick(fields, DATE_LABELS) ?? '');
  const reference = pick(fields, REFERENCE_LABELS)?.replace(/\s+/g, '').slice(0, 64) || null;
  const kind = detectKind(haystack);
  const type = INCOME_RE.test(haystack) ? 'INCOME' : 'EXPENSE';
  const counterparty = cleanName(pick(fields, COUNTERPARTY_LABELS));

  return {
    source: isBca ? 'bca' : email.fromDomain,
    kind,
    type,
    amount,
    fee,
    date: when.date,
    time: when.time,
    counterparty,
    reference,
    accountHint: maskAccount(pick(fields, ACCOUNT_LABELS)),
    note: noteFor(kind, type, counterparty, email.subject, pick(fields, MEMO_LABELS)),
    confident: isBca && when.date !== null && reference !== null,
  };
}
