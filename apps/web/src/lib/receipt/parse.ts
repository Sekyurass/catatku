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
  /** Barang yang dibeli, urut seperti di struk (maks. MAX_ITEMS). */
  items: ReceiptItem[];
}

export interface ReceiptItem {
  name: string;
  /** Harga baris (jumlah × harga satuan) seperti tercetak; null bila tidak terbaca. */
  price: number | null;
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

/** Semua tanggal valid di satu baris, urut dari kiri. */
function datesIn(text: string): string[] {
  const found: Array<{ index: number; iso: string }> = [];
  for (const { re, order } of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
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
  return found.sort((x, y) => x.index - y.index).map((f) => f.iso);
}

function findPrintedDate(lines: Line[], today: string): ReceiptField<string> | null {
  for (const line of lines) {
    for (const iso of datesIn(line.text)) {
      const age = daysBetween(iso, today);
      // Masa depan atau terlalu lama = hampir pasti salah baca (mis. jam "10.10.10").
      if (age < -1 || age > MAX_RECEIPT_AGE_DAYS) continue;
      const sure = age <= 365 && line.confidence >= MIN_OCR_CONFIDENCE;
      return { value: iso, confidence: sure ? 'high' : 'low' };
    }
  }
  return null;
}

/** Baris nomor struk; banyak mesin kasir menanam tanggal YYYYMMDD di nomornya (HCB01202610070002). */
const RECEIPT_NO_RE = /\b(NO|STRUK|NOTA|INVOICE|BILL|TRX|REF|KODE|PENJUALAN|TRANS(AKSI)?)\b/;
const PHONE_LINE_RE = /\b(TELP?|TLP|HP|WA|NPWP|PHONE)\b/;

function findEmbeddedDate(lines: Line[], today: string): string | null {
  for (const line of lines) {
    if (!RECEIPT_NO_RE.test(line.text) || PHONE_LINE_RE.test(line.text)) continue;
    for (const [token] of line.text.matchAll(/[A-Z0-9]{10,}/g)) {
      for (const m of token.matchAll(/(?=(20\d{2})(\d{2})(\d{2}))/g)) {
        const iso = toIsoDate(+m[1]!, +m[2]!, +m[3]!);
        if (!iso) continue;
        const age = daysBetween(iso, today);
        if (age >= -1 && age <= 365) return iso;
      }
    }
  }
  return null;
}

/** Pasangan angka yang sering tertukar oleh OCR pada font struk (mis. 7 terbaca 1). */
const CONFUSABLE_DIGITS = new Set(['17', '71', '08', '80', '38', '83', '56', '65', '68', '86']);

const differsOnlyByConfusables = (a: string, b: string) =>
  a.length === b.length && [...a].every((c, i) => c === b[i] || CONFUSABLE_DIGITS.has(c + b[i]));

/** Tanggal tercetak, dicek silang dengan tanggal di nomor struk bila ada. */
function findDate(lines: Line[], today: string): ReceiptField<string> | null {
  const printed = findPrintedDate(lines, today);
  const embedded = findEmbeddedDate(lines, today);
  if (!embedded || printed?.value === embedded) return printed;
  if (!printed || differsOnlyByConfusables(printed.value, embedded)) {
    return { value: embedded, confidence: 'low' };
  }
  return { value: printed.value, confidence: 'low' };
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
const KEEP_UPPER = new Set([
  'PT',
  'CV',
  'UD',
  'TB',
  'RM',
  'KFC',
  'SPBU',
  'UHT',
  'ATM',
  'LPG',
  'USB',
  'AC',
  'TV',
]);

/** Singkatan tanpa vokal (UHT, KFC, SPC) dan ukuran satu huruf (2L) tetap huruf besar. */
const keepUpper = (w: string) => {
  const bare = w.replace(/[.,]/g, '');
  return KEEP_UPPER.has(bare) || /^[B-DF-HJ-NP-TV-Z]{2,4}$/.test(bare) || /^\d+[A-Z]$/.test(bare);
};

function titleCase(text: string): string {
  return text
    .split(' ')
    .map((w) => (keepUpper(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

/** Kata yang menandakan nama usaha; dipakai untuk mengalahkan teks logo yang terbaca lebih dulu. */
const BUSINESS_RE =
  /\b(TOKO|WARUNG|WARTEG|RM|RUMAH MAKAN|RESTO|RESTORAN|RESTAURANT|KAFE|CAFE|COFFEE|KOPI|BAKERY|ROTI|DONUT|PIZZA|BURGER|CHICKEN|AYAM|BAKSO|MIE|BAKMI|SATE|SEAFOOD|STEAK|DIMSUM|BOBA|TEA|KITCHEN|MART|MINIMARKET|SUPERMARKET|APOTEK|APOTIK|FARMA|LAUNDRY|SALON|BENGKEL|SPBU)\b/;
/** Kata utuh: ≥ 4 huruf dan ada vokal. Teks logo yang terbaca OCR biasanya potongan 1–3 huruf. */
const hasRealWord = (text: string) =>
  text.split(/[\s.,&\-/]+/).some((w) => /^[A-Z']{4,}$/.test(w) && /[AEIOU]/.test(w));
const MIN_MERCHANT_OCR_CONFIDENCE = 50;

function merchantCandidate(line: Line): string | null {
  const text = line.text.replace(/^[^A-Z0-9]+|[^A-Z0-9.)']+$/g, '').replace(/\s+/g, ' ');
  const letters = text.replace(/[^A-Z]/g, '').length;
  const visible = text.replace(/\s/g, '').length;
  if (letters < 3 || visible === 0 || letters / visible < 0.7 || text.length > 40) return null;
  if (text.includes(':') || line.confidence < MIN_MERCHANT_OCR_CONFIDENCE || !hasRealWord(text)) {
    return null;
  }
  if (NOT_MERCHANT_RE.test(text) || DATE_PATTERNS.some(({ re }) => new RegExp(re).test(text))) {
    return null;
  }
  return text;
}

function findMerchant(lines: Line[]): ReceiptField<string> | null {
  const head = lines.slice(0, 10);
  for (const line of head.slice(0, 8)) {
    for (const [re, name] of KNOWN_MERCHANTS) {
      if (re.test(line.text)) return { value: name, confidence: 'high' };
    }
  }
  // Nama toko selalu di atas blok data transaksi ("No :", "Tanggal :", "Kasir :").
  const metaStart = head.findIndex((l) => l.text.includes(':') && NOT_MERCHANT_RE.test(l.text));
  const candidates = (metaStart >= 0 ? head.slice(0, metaStart) : head.slice(0, 5))
    .map(merchantCandidate)
    .filter((text): text is string => text !== null);
  const first = candidates[0];
  if (!first) return null;
  const chosen = BUSINESS_RE.test(first)
    ? first
    : (candidates.find((t) => BUSINESS_RE.test(t)) ?? first);
  return { value: titleCase(chosen), confidence: 'low' };
}

const MAX_ITEMS = 12;
const MAX_ITEM_LENGTH = 40;
/** Batas daftar barang: baris total/subtotal/jumlah item, atau baris pembayaran. */
const ITEMS_END_RE = new RegExp(
  `\\b(SUB\\s?-?\\s?)?${TOTAL}\\b|\\b(JUMLAH|JML|ITEM|QTY|TUNAI|CASH|KEMBALI(AN)?|CHANGE)\\b`,
);
/** Baris kepala struk (alamat, kasir, nomor, jam); barang selalu tercetak di bawahnya. */
const isHeaderLine = (text: string) =>
  text.includes(':') || text.includes('#') || NOT_MERCHANT_RE.test(text) || ID_LINE_RE.test(text);
/** Biaya tambahan, bukan barang. Baris berpersen (PB1 10%, Service 5%) juga dilewati. */
const NOT_ITEM_RE =
  /%|\b(PB1|PPN|DPP|PAJAK|TAX|SERVICE CHARGE|DISKON|DISC|POTONGAN|HEMAT|VOUCHER|DONASI|PEMBULATAN|ROUNDING|ADMIN|ONGKIR|POIN|POINT|DEPOSIT)\b/;
/** Token penutup baris barang: jumlah, harga, satuan ("2 x 25.000 50.000", "1 STRIP 12.500"). */
const ITEM_TAIL_RE =
  /^(\d[\d.,]*|X|@|RP\.?|PCS|PC|STRIP|BTL|BOTOL|SAK|BH|BUAH|KG|GR|G|L|LTR|ML|PAK|PACK|BOX|DUS|-+\.?)$/;

/** Harga berformat ribuan ("18.000", "RP15.000"); semua setelahnya bukan bagian nama barang. */
const PRICE_TOKEN_RE = /^(RP\.?)?\d{1,3}([.,]\d{3})+([.,]\d{2})?$/;

function itemName(line: string): string | null {
  const words = line
    .replace(/^\d{1,3}\s?X?\s+(?=[A-Z])/, '')
    .split(' ')
    .filter(Boolean);
  const price = words.findIndex((w) => PRICE_TOKEN_RE.test(w));
  if (price >= 0) words.length = price;
  while (words.length > 0 && ITEM_TAIL_RE.test(words.at(-1)!)) words.pop();
  const name = words.join(' ').replace(/[^A-Z0-9)%]+$/, '');
  const letters = name.replace(/[^A-Z]/g, '').length;
  const visible = name.replace(/\s/g, '').length;
  if (letters < 3 || letters / visible < 0.5) return null;
  return titleCase(name.slice(0, MAX_ITEM_LENGTH).trim());
}

function findItems(lines: Line[]): ReceiptItem[] {
  let end = lines.findIndex((l) => ITEMS_END_RE.test(l.text));
  if (end < 0) end = lines.length;
  let start = 0;
  for (let i = 0; i < end; i++) {
    if (isHeaderLine(lines[i]!.text) || datesIn(lines[i]!.text).length > 0) start = i + 1;
  }
  const items: ReceiptItem[] = [];
  // Supermarket sering mencetak nama di satu baris lalu "1 x 38.500  38.500" di baris berikutnya.
  let pendingName: string | null = null;
  for (const { text } of lines.slice(start, end)) {
    if (NOT_ITEM_RE.test(text)) {
      pendingName = null;
      continue;
    }
    const price = FORMATTED_AMOUNT_RE.test(text) ? lastAmount(text) : undefined;
    if (price === undefined) {
      pendingName = itemName(text);
      continue;
    }
    const name = itemName(text) ?? pendingName;
    pendingName = null;
    if (name) items.push({ name, price });
  }
  return items.slice(0, MAX_ITEMS);
}

const NOTE_MAX = 200;

/** "Indomie Goreng Rp6.200"; format yang sama dibaca lagi oleh `splitNoteItems`. */
export function itemNoteText({ name, price }: ReceiptItem): string {
  return price === null ? name : `${name} Rp${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/**
 * "Toko: Barang A Rp5.000, Barang B Rp7.500" muat dalam batas catatan; sisa barang diringkas
 * "+N lainnya".
 */
export function receiptNote(merchant: string | null, items: ReceiptItem[]): string | null {
  if (items.length === 0) return merchant;
  const prefix = merchant ? `${merchant}: ` : '';
  const texts = items.map(itemNoteText);
  for (let n = texts.length; n > 0; n--) {
    const rest = texts.length - n;
    const note = `${prefix}${texts.slice(0, n).join(', ')}${rest > 0 ? ` +${rest} lainnya` : ''}`;
    if (note.length <= NOTE_MAX) return note;
  }
  return merchant;
}

/** Ambil total, tanggal, nama toko, dan barang dari teks hasil OCR. Tidak pernah melempar error. */
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
    items: findItems(lines),
  };
}

export function countFields(fields: ReceiptFields): number {
  return [fields.total, fields.date, fields.merchant].filter(Boolean).length;
}
