import { MAX_AMOUNT } from '@catatku/shared';

export type Confidence = 'high' | 'low';

export interface ReceiptField<T> {
  value: T;
  confidence: Confidence;
}

export interface ReceiptFields {
  /** Total yang dibayar, Rupiah bulat. */
  total: ReceiptField<number> | null;
  /** YYYY-MM-DD */
  date: ReceiptField<string> | null;
  merchant: ReceiptField<string> | null;
}

export interface OcrLine {
  text: string;
  /** Keyakinan mesin OCR 0–100; tidak ada = dianggap yakin. */
  confidence?: number;
}

const MIN_OCR_CONFIDENCE = 70;
const MIN_TOTAL = 100;
const MAX_RECEIPT_AGE_DAYS = 3 * 365;

/** Karakter yang sering tertukar dengan angka oleh OCR, hanya dipakai di token yang mirip angka. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: '0',
  o: '0',
  D: '0',
  Q: '0',
  I: '1',
  l: '1',
  '|': '1',
  S: '5',
  B: '8',
};

function fixDigitToken(token: string): string {
  if (token.length < 3 || !/\d/.test(token)) return token;
  const fixed = token.replace(/[OoDQIl|SB]/g, (c) => DIGIT_LOOKALIKES[c]!);
  return /^\d[\d.,/:-]*\d$/.test(fixed) ? fixed : token;
}

/** Rapikan satu baris: huruf besar, spasi tunggal, angka yang terpisah spasi/tertukar huruf disatukan. */
export function normalizeLine(text: string): string {
  return text
    .replace(/[‘’`]/g, "'")
    .split(/\s+/)
    .map(fixDigitToken)
    .join(' ')
    .toUpperCase()
    .replace(/(\d)\s*([.,])\s+(?=\d{3}(?!\d))/g, '$1$2')
    .replace(/\bRP\s*\.?\s*(?=\d)/g, 'RP ')
    .trim();
}

const AMOUNT_RE =
  /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d.,]*\d)/g;

/** "54.300" | "54,300.00" | "1.250.000" | "54300" → angka bulat; desimal (sen) dibuang. */
export function parseAmount(token: string): number | null {
  let t = token.trim();
  if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(t)) {
    t = t.replace(/[.,]\d{1,2}$/, '');
  } else if (/^\d+[.,]\d{1,2}$/.test(t)) {
    t = t.replace(/[.,]\d{1,2}$/, '');
  } else if (!/^\d+$/.test(t)) {
    return null;
  }
  const value = Number(t.replace(/[.,]/g, ''));
  return Number.isSafeInteger(value) ? value : null;
}

function amountsIn(line: string): number[] {
  return [...line.matchAll(AMOUNT_RE)]
    .map((m) => parseAmount(m[1]!))
    .filter((n): n is number => n !== null);
}

/** Toleran pada salah baca umum: T0TAL, TOTAI, T O T A L. */
const fuzzy = (word: string) =>
  word
    .split('')
    .map((c) => ({ O: '[O0Q]', A: '[A4]', L: '[L1I]', I: '[I1L]', S: '[S5]', E: '[E3]' })[c] ?? c)
    .join('\\s?');

const TOTAL = fuzzy('TOTAL');
const SUBTOTAL_RE = new RegExp(`\\bSUB\\s?-?\\s?${TOTAL}\\b`);
const EXCLUDED_RE = new RegExp(
  [
    `\\b${TOTAL}\\s?(ITEM|ITM|QTY|JML|JUMLAH\\s?ITEM|DISKON|DISC|HEMAT|PPN|PAJAK|TAX|POTONGAN|POIN|POINT)`,
    '\\b(TUNAI|CASH|KEMBALI(AN)?|CHANGE|DISKON|DISC|HEMAT|ANDA\\s?HEMAT|PPN|PAJAK|DPP|POIN|POINT|VOUCHER|DEBIT|KREDIT|KARTU|QRIS|GOPAY|OVO|DANA|SHOPEEPAY|LINKAJA|NON\\s?TUNAI|ITEM|QTY|SERVICE|SERVIS)\\b',
  ].join('|'),
);
const TOTAL_KEYWORDS: Array<[RegExp, number]> = [
  [new RegExp(`\\bGRAND\\s?${TOTAL}\\b`), 100],
  [
    new RegExp(
      `\\b${TOTAL}\\s?(BAYAR|BELANJA|TAGIHAN|PEMBAYARAN|HARGA|AKHIR|PENJUALAN|TRANSAKSI|RP)\\b`,
    ),
    90,
  ],
  [/\b(JUMLAH|JML)\s?(BAYAR|TAGIHAN|TOTAL|HARGA)\b/, 85],
  [new RegExp(`\\b${TOTAL}\\b`), 80],
  [/\b(JUMLAH|TAGIHAN|NETTO|AMOUNT)\b/, 50],
];

interface Line {
  text: string;
  confidence: number;
}

function totalScore(line: string): number {
  if (SUBTOTAL_RE.test(line)) return 30;
  if (EXCLUDED_RE.test(line)) return 0;
  for (const [re, score] of TOTAL_KEYWORDS) if (re.test(line)) return score;
  return 0;
}

const CASH_RE = /\b(TUNAI|CASH|DIBAYAR|BAYAR)\b/;
const CHANGE_RE = /\b(KEMBALI(AN)?|CHANGE)\b/;
/** Baris identitas (telepon, NPWP, nomor struk) berisi deret angka yang bukan nominal. */
const ID_LINE_RE = /\b(TELP?|TLP|HP|WA|NPWP|NO|KASIR|STRUK|NOTA|INVOICE|ID|KODE|REF|TRX|NIK)\b/;
const FORMATTED_AMOUNT_RE = /(?:\bRP\s?)\d|\d[.,]\d{3}(?!\d)/;

const isPlausibleTotal = (n: number) => n >= MIN_TOTAL && n <= MAX_AMOUNT;

function lastAmount(line: string): number | undefined {
  return amountsIn(line).filter(isPlausibleTotal).at(-1);
}

function findTotal(lines: Line[]): ReceiptField<number> | null {
  let best: { amount: number; score: number; confidence: number } | undefined;
  for (const [i, line] of lines.entries()) {
    const score = totalScore(line.text);
    if (score === 0) continue;
    let amount = lastAmount(line.text);
    let confidence = line.confidence;
    // Nominal kadang tercetak di baris berikutnya ("TOTAL BELANJA" lalu "54.300").
    const next = lines[i + 1];
    if (amount === undefined && next && !/[A-Z]{3,}/.test(next.text.replace(/\bRP\b/, ''))) {
      amount = lastAmount(next.text);
      confidence = Math.min(confidence, next.confidence);
    }
    // Skor sama → ambil yang lebih bawah (total akhir setelah diskon/pajak).
    if (amount !== undefined && (!best || score >= best.score)) {
      best = { amount, score, confidence };
    }
  }

  const cash = lines.find(
    (l) => CASH_RE.test(l.text) && !CHANGE_RE.test(l.text) && totalScore(l.text) === 0,
  );
  const change = lines.find((l) => CHANGE_RE.test(l.text));
  const cashAmount = cash && lastAmount(cash.text);
  const changeAmount = change && amountsIn(change.text).at(-1);
  const paidMinusChange =
    cashAmount !== undefined && changeAmount !== undefined && cashAmount > changeAmount
      ? cashAmount - changeAmount
      : undefined;

  if (best) {
    const consistent = paidMinusChange === undefined || paidMinusChange === best.amount;
    const sure = best.score >= 80 && best.confidence >= MIN_OCR_CONFIDENCE && consistent;
    return { value: best.amount, confidence: sure ? 'high' : 'low' };
  }
  if (paidMinusChange !== undefined && isPlausibleTotal(paidMinusChange)) {
    return { value: paidMinusChange, confidence: 'low' };
  }
  // Tanpa kata kunci: nominal berformat terbesar, selain baris bayar/kembalian/identitas.
  const candidates = lines
    .filter(
      (l) =>
        FORMATTED_AMOUNT_RE.test(l.text) &&
        !CASH_RE.test(l.text) &&
        !CHANGE_RE.test(l.text) &&
        !EXCLUDED_RE.test(l.text) &&
        !ID_LINE_RE.test(l.text),
    )
    .flatMap((l) => amountsIn(l.text))
    .filter(isPlausibleTotal);
  if (candidates.length === 0) return null;
  return { value: Math.max(...candidates), confidence: 'low' };
}

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  PEB: 2,
  MAR: 3,
  APR: 4,
  MEI: 5,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGU: 8,
  AGT: 8,
  AGS: 8,
  AUG: 8,
  SEP: 9,
  OKT: 10,
  OCT: 10,
  NOV: 11,
  NOP: 11,
  DES: 12,
  DEC: 12,
};

const DATE_PATTERNS: Array<{ re: RegExp; order: 'ymd' | 'dmy' | 'dMy' }> = [
  { re: /(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g, order: 'ymd' },
  { re: /(?<!\d)(\d{1,2})\s?[-/.]\s?(\d{1,2})\s?[-/.]\s?(\d{4}|\d{2})(?!\d)/g, order: 'dmy' },
  { re: /(?<!\d)(\d{1,2})[\s-]*([A-Z]{3,9})\.?[\s,-]*(\d{4}|\d{2})(?!\d)/g, order: 'dMy' },
];

const pad = (n: number) => String(n).padStart(2, '0');

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function findDate(lines: Line[], today: string): ReceiptField<string> | null {
  for (const line of lines) {
    const found: Array<{ index: number; iso: string }> = [];
    for (const { re, order } of DATE_PATTERNS) {
      for (const m of line.text.matchAll(re)) {
        const [, a, b, c] = m as unknown as [string, string, string, string];
        let iso: string | null = null;
        if (order === 'ymd') iso = toIsoDate(+a, +b, +c);
        else if (order === 'dmy') iso = toIsoDate(+c, +b, +a);
        else {
          const month = MONTHS[b.slice(0, 3)];
          if (month) iso = toIsoDate(+c, month, +a);
        }
        if (iso) found.push({ index: m.index, iso });
      }
    }
    found.sort((x, y) => x.index - y.index);
    for (const { iso } of found) {
      const age = daysBetween(iso, today);
      // Masa depan atau terlalu lama = hampir pasti salah baca (mis. jam "10.10.10").
      if (age < -1 || age > MAX_RECEIPT_AGE_DAYS) continue;
      const sure = age <= 365 && line.confidence >= MIN_OCR_CONFIDENCE;
      return { value: iso, confidence: sure ? 'high' : 'low' };
    }
  }
  return null;
}

const KNOWN_MERCHANTS: Array<[RegExp, string]> = [
  [/INDOMARET|INDOMARCO/, 'Indomaret'],
  [/ALFAMIDI|MIDI UTAMA/, 'Alfamidi'],
  [/ALFAMART|ALFARIA/, 'Alfamart'],
  [/LAWSON/, 'Lawson'],
  [/FAMILY\s?MART/, 'FamilyMart'],
  [/CIRCLE\s?K\b/, 'Circle K'],
  [/SUPER\s?INDO|LION SUPER/, 'Superindo'],
  [/HYPERMART/, 'Hypermart'],
  [/TRANSMART|CARREFOUR/, 'Transmart'],
  [/PERTAMINA/, 'Pertamina'],
  [/\bSHELL\b/, 'Shell'],
  [/STARBUCKS/, 'Starbucks'],
  [/\bKFC\b|FASTFOOD INDONESIA/, 'KFC'],
  [/MC\s?DONALD/, "McDonald's"],
  [/GUARDIAN/, 'Guardian'],
  [/WATSONS/, 'Watsons'],
  [/KIMIA FARMA/, 'Kimia Farma'],
  [/\bCENTURY\b/, 'Century'],
];

const NOT_MERCHANT_RE =
  /\b(JL|JLN|JALAN|TELP?|TLP|PHONE|HP|WA|NPWP|NO|KASIR|STRUK|NOTA|INVOICE|FAKTUR|TANGGAL|TGL|JAM|WWW|HTTPS?|RT|RW|KEL|KEC|KAB|KOTA|BLOK|RUKO|LT|CABANG|CAB|BON|ORDER|MEJA|TABLE|SELAMAT|WELCOME|TERIMA|KASIH|CUSTOMER|PELANGGAN|ALAMAT|KODE|ID)\b/;
const KEEP_UPPER = new Set(['PT', 'CV', 'UD', 'TB', 'RM', 'KFC', 'SPBU']);

function titleCase(text: string): string {
  return text
    .split(' ')
    .map((w) => (KEEP_UPPER.has(w.replace(/\./g, '')) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

function findMerchant(lines: Line[]): ReceiptField<string> | null {
  const head = lines.slice(0, 8);
  for (const line of head) {
    for (const [re, name] of KNOWN_MERCHANTS) {
      if (re.test(line.text)) return { value: name, confidence: 'high' };
    }
  }
  for (const line of head.slice(0, 5)) {
    const text = line.text.replace(/^[^A-Z0-9]+|[^A-Z0-9.)']+$/g, '').replace(/\s+/g, ' ');
    const letters = text.replace(/[^A-Z]/g, '').length;
    const visible = text.replace(/\s/g, '').length;
    if (letters < 3 || visible === 0 || letters / visible < 0.7 || text.length > 40) continue;
    if (NOT_MERCHANT_RE.test(text) || DATE_PATTERNS.some(({ re }) => new RegExp(re).test(text))) {
      continue;
    }
    return { value: titleCase(text), confidence: 'low' };
  }
  return null;
}

/** Ambil total, tanggal, dan nama toko dari teks hasil OCR. Tidak pernah melempar error. */
export function parseReceiptText(input: string | OcrLine[], today: string): ReceiptFields {
  const raw: OcrLine[] =
    typeof input === 'string' ? input.split(/\r?\n/).map((text) => ({ text })) : input;
  const lines: Line[] = raw
    .map((l) => ({ text: normalizeLine(l.text), confidence: l.confidence ?? 100 }))
    .filter((l) => l.text.length > 0);
  return {
    total: findTotal(lines),
    date: findDate(lines, today),
    merchant: findMerchant(lines),
  };
}

export function countFields(fields: ReceiptFields): number {
  return [fields.total, fields.date, fields.merchant].filter(Boolean).length;
}
