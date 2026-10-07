import { suggestCategoryByKeyword } from './categorize';
import { type CategoryType, MAX_AMOUNT, type TransactionType, type WalletType } from './constants';

/**
 * Parser "ketik cepat" berbasis aturan (regex + kamus), tanpa AI: "makan siang 25rb di warteg",
 * "gaji 5jt masuk bca kemarin", "transfer 200k bca ke gopay". Hasilnya hanya mengisi form; pengguna
 * selalu meninjau sebelum menyimpan.
 */

export interface QuickTextWallet {
  id: string;
  name: string;
  type: WalletType;
}

export interface QuickTextCategory {
  id: string;
  name: string;
  type: CategoryType;
}

export interface QuickTextSuggestion {
  categoryId: string;
  source: 'history' | 'keyword';
}

export interface QuickTextContext {
  /** YYYY-MM-DD (zona waktu aplikasi). */
  today: string;
  /** Hanya dompet & kategori aktif. */
  wallets: QuickTextWallet[];
  categories: QuickTextCategory[];
  /** Saran dari riwayat pengguna + kata kunci. Default: kamus kata kunci saja. */
  suggestCategory?: (note: string, type: CategoryType) => QuickTextSuggestion | null;
}

export type QuickTextField = 'type' | 'amount' | 'date' | 'wallet' | 'toWallet' | 'category';

export interface QuickTextResult {
  type: TransactionType;
  amount: number | null;
  /** null = tidak disebut (pakai hari ini). */
  date: string | null;
  walletId: string | null;
  toWalletId: string | null;
  categoryId: string | null;
  note: string;
  /** Isian yang benar-benar terbaca dari teks, bukan bawaan. */
  found: QuickTextField[];
  /** low = ada yang belum terbaca atau ditebak (mis. beberapa nominal dijumlahkan). */
  confidence: 'high' | 'low';
}

const L = '\\p{L}\\p{N}';
const START = `(?<![${L}])`;
const END = `(?![${L}])`;
const word = (body: string) => new RegExp(`${START}(?:${body})${END}`, 'giu');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ejaan merek yang sering berbeda: "go-pay", "Shopee Pay", "link aja". */
const BRAND_SPELLINGS: Array<[RegExp, string]> = [
  [word('go[\\s-]?pay'), 'gopay'],
  [word('shopee[\\s-]?pay|spay'), 'shopeepay'],
  [word('link[\\s-]?aja'), 'linkaja'],
];

function canonical(text: string): string {
  let out = text.toLowerCase();
  for (const [re, to] of BRAND_SPELLINGS) out = out.replace(re, to);
  return out.replace(/\s+/g, ' ').trim();
}

/** Nama → pola fleksibel: "Bank Jago" cocok dengan "bank jago", "bank-jago". */
function namePattern(name: string): string | null {
  const tokens = canonical(name)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map(escapeRe).join("[\\s\\-_.']*");
}

// ---------- Tanggal ----------

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  peb: 2,
  mar: 3,
  maret: 3,
  apr: 4,
  april: 4,
  mei: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  agu: 8,
  agt: 8,
  ags: 8,
  agus: 8,
  agustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  nop: 11,
  november: 11,
  nopember: 11,
  des: 12,
  desember: 12,
};
const MONTH_RE = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');

const WEEKDAYS: Record<string, number> = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  "jum'at": 5,
  sabtu: 6,
};

const NUMBER_WORDS: Record<string, number> = { se: 1, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5 };

function dayMs(date: string) {
  return Date.parse(`${date}T00:00:00Z`);
}
function addDays(date: string, days: number) {
  return new Date(dayMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}
function makeDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function fullYear(raw: string | undefined, fallback: number) {
  if (!raw) return fallback;
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

/** Tanggal tanpa tahun/bulan yang jatuh setelah hari ini dianggap tahun/bulan lalu (mencatat ke belakang). */
function resolveDate(today: string, d: number, m?: number, y?: string): string | null {
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  if (m === undefined) {
    const thisMonth = makeDate(ty, tm, d);
    if (thisMonth && thisMonth <= today) return thisMonth;
    const prevY = tm === 1 ? ty - 1 : ty;
    const prevM = tm === 1 ? 12 : tm - 1;
    return makeDate(prevY, prevM, d) ?? thisMonth;
  }
  const date = makeDate(fullYear(y, ty), m, d);
  if (date && !y && date > today) return makeDate(ty - 1, m, d);
  return date;
}

interface DateRule {
  re: RegExp;
  resolve: (m: RegExpExecArray, today: string) => string | null;
}

const DATE_RULES: DateRule[] = [
  { re: word('kemarin lusa|kemaren lusa'), resolve: (_, t) => addDays(t, -2) },
  {
    re: word('(\\d{1,2}|se|satu|dua|tiga|empat|lima) ?hari (?:yang |yg )?lalu'),
    resolve: (m, t) => {
      const n = NUMBER_WORDS[m[1]!] ?? Number(m[1]);
      return n <= 60 ? addDays(t, -n) : null;
    },
  },
  {
    re: word('(?:kemarin|kemaren|kmrn|kmarin|kmren|kemrin)(?: (?:pagi|siang|sore|malam))?|semalam'),
    resolve: (_, t) => addDays(t, -1),
  },
  {
    re: word('hari ini|hr ini|barusan|tadi(?: (?:pagi|siang|sore|malam))?'),
    resolve: (_, t) => t,
  },
  {
    re: word(
      `(?:tgl|tanggal|tg)\\.? ?(\\d{1,2})(?:(?: |/|-)(\\d{1,2}|${MONTH_RE})(?:(?: |/|-)(\\d{4}|\\d{2}))?)?`,
    ),
    resolve: (m, t) => {
      const month = m[2] ? (MONTHS[m[2]] ?? Number(m[2])) : undefined;
      return resolveDate(t, Number(m[1]), month, m[3]);
    },
  },
  {
    re: word(`(\\d{1,2}) (${MONTH_RE})(?: (\\d{4}))?`),
    resolve: (m, t) => resolveDate(t, Number(m[1]), MONTHS[m[2]!], m[3]),
  },
  {
    re: word('(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?|(\\d{1,2})-(\\d{1,2})-(\\d{4})'),
    resolve: (m, t) =>
      m[1]
        ? resolveDate(t, Number(m[1]), Number(m[2]), m[3])
        : resolveDate(t, Number(m[4]), Number(m[5]), m[6]),
  },
  {
    // "minggu lalu/ini/depan" = pekan, bukan hari Minggu.
    re: word(
      `(?:hari )?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?! (?:ini|depan))(?: (lalu|kemarin|kmrn))?`,
    ),
    resolve: (m, t) => {
      if (m[1] === 'minggu' && m[2] === 'lalu' && !m[0].startsWith('hari')) return null;
      const target = WEEKDAYS[m[1]!]!;
      const todayDow = new Date(dayMs(t)).getUTCDay();
      let back = (todayDow - target + 7) % 7;
      if (back === 0 && m[2]) back = 7;
      return addDays(t, -back);
    },
  },
];

// ---------- Nominal ----------

const SLANG_AMOUNTS: Record<string, number> = {
  gopek: 500,
  seceng: 1_000,
  seribu: 1_000,
  goceng: 5_000,
  ceban: 10_000,
  noban: 20_000,
  goban: 50_000,
  gocap: 50_000,
  'setengah juta': 500_000,
  sejuta: 1_000_000,
};

const MULTIPLIERS: Record<string, number> = {
  rb: 1_000,
  rbu: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  jeti: 1_000_000,
};

/** "1,5" / "1.5" = desimal; "1.500" = ribuan. */
function suffixNumber(raw: string): number {
  const groups = raw.split(/[.,]/);
  if (groups.length === 1) return Number(raw);
  const last = groups.at(-1)!;
  if (groups.length === 2 && last.length !== 3) return Number(`${groups[0]}.${last}`);
  return Number(groups.join(''));
}

interface AmountRule {
  re: RegExp;
  value: (m: RegExpExecArray) => number;
}

const AMOUNT_RULES: AmountRule[][] = [
  [
    {
      re: word(
        `(?:rp\\.? ?)?(\\d+(?:[.,]\\d+)*) ?(rb|rbu|ribu|k|jt|juta|jeti)(?:an)?|(${Object.keys(SLANG_AMOUNTS).join('|')})`,
      ),
      value: (m) =>
        m[3] ? SLANG_AMOUNTS[m[3]]! : Math.round(suffixNumber(m[1]!) * MULTIPLIERS[m[2]!]!),
    },
  ],
  [
    {
      re: word('rp\\.? ?(\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?:,\\d{1,2})?'),
      value: (m) => Number(m[1]!.replace(/[.,]/g, '')),
    },
  ],
  [{ re: word('\\d{1,3}(?:\\.\\d{3})+'), value: (m) => Number(m[0].replace(/\./g, '')) }],
  // Angka polos: minimal 100 dan tidak diawali 0 (bukan jumlah barang atau nomor HP).
  [{ re: word('[1-9]\\d{2,11}'), value: (m) => Number(m[0]) }],
];

// ---------- Jenis ----------

const TRANSFER_WORDS = word(
  'transfer|trf|tf|pindah(?:in|kan)?|mindahin|top ?up|isi saldo|isi ulang saldo|isi ulang|nabung|menabung',
);
const CASH_OUT = word('tarik tunai|tarik cash|ambil tunai|ambil uang|tarik uang|tarik');
const CASH_IN = word('setor tunai|setor');
const INCOME_WORDS = word(
  [
    'gaji',
    'gajian',
    'terima',
    'diterima',
    'nerima',
    'dapat',
    'dapet',
    'dpt',
    'pemasukan',
    'bonus',
    'thr',
    'dibayar',
    'dibayarin',
    'refund',
    'cashback',
    'cash back',
    'jual',
    'jualan',
    'honor',
    'komisi',
    'transferan',
    'dikirimi',
    'dikasih',
    'uang saku',
    'angpao',
    'angpau',
    'hadiah',
    'dividen',
    'penghasilan',
    'pendapatan',
    'masuk',
  ].join('|'),
);
const EXPENSE_WORDS = word('beli|bayar|byr|jajan|belanja|keluar|pengeluaran');

const CASH_ALIASES = ['uang tunai', 'uang cash', 'tunai', 'cash'];
const BANK_ALIASES = ['rekening', 'rek', 'bank'];
const EWALLET_ALIASES = ['e-wallet', 'ewallet', 'dompet digital'];

const PREPOSITIONS =
  '(?:(dari|dr|ke dalam|ke|k|pakai|pake|pakek|pk|via|lewat|dengan|dgn|masuk ke|masuk|di) )?';
const TO_PREPS = new Set(['ke', 'k', 'ke dalam', 'masuk ke']);
const FROM_PREPS = new Set([
  'dari',
  'dr',
  'pakai',
  'pake',
  'pakek',
  'pk',
  'via',
  'lewat',
  'dengan',
  'dgn',
]);

function has(re: RegExp, text: string) {
  re.lastIndex = 0;
  const hit = re.test(text);
  re.lastIndex = 0;
  return hit;
}

/** Kata sambung yang tersisa di ujung catatan setelah bagian lain diambil. */
const DANGLING = new Set([
  'di',
  'ke',
  'dari',
  'dr',
  'pakai',
  'pake',
  'via',
  'lewat',
  'dan',
  'sama',
  'yang',
  'yg',
  'rp',
  'senilai',
  'sebesar',
  'seharga',
  'total',
]);

// ---------- Parser ----------

interface Span {
  start: number;
  end: number;
}

class Scanner {
  readonly text: string;
  private readonly mask: boolean[];

  constructor(text: string) {
    this.text = text;
    this.mask = Array.from({ length: text.length }, () => false);
  }

  free(span: Span) {
    for (let i = span.start; i < span.end; i++) if (this.mask[i]) return false;
    return true;
  }

  take(span: Span) {
    for (let i = span.start; i < span.end; i++) this.mask[i] = true;
  }

  release(span: Span) {
    for (let i = span.start; i < span.end; i++) this.mask[i] = false;
  }

  /** Semua kecocokan yang belum terpakai, berurutan. */
  matches(re: RegExp): RegExpExecArray[] {
    const out: RegExpExecArray[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (this.free(spanOf(m))) out.push(m);
    }
    return out;
  }

  rest(source: string): string {
    let out = '';
    for (let i = 0; i < source.length; i++) out += this.mask[i] ? ' ' : source[i];
    return out;
  }
}

const spanOf = (m: RegExpExecArray): Span => ({ start: m.index, end: m.index + m[0].length });

interface WalletHit extends Span {
  walletId: string;
  prep: string | null;
}

function walletAliases(wallets: QuickTextWallet[]): Array<{ pattern: string; walletId: string }> {
  const out: Array<{ pattern: string; walletId: string; length: number }> = [];
  const add = (name: string, walletId: string) => {
    const pattern = namePattern(name);
    if (pattern) out.push({ pattern, walletId, length: name.length });
  };
  for (const w of wallets) add(w.name, w.id);
  // Kata pertama nama ("BCA Tahapan" → "bca") bila tidak dipakai dompet lain.
  for (const w of wallets) {
    const first = canonical(w.name).split(' ')[0]!;
    if (first.length < 3 || first === canonical(w.name)) continue;
    const shared = wallets.some(
      (o) => o.id !== w.id && canonical(o.name).split(' ').includes(first),
    );
    if (!shared) add(first, w.id);
  }
  const byType = (type: WalletType, aliases: string[]) => {
    const list = wallets.filter((w) => w.type === type);
    if (list.length === 1) for (const a of aliases) add(a, list[0]!.id);
  };
  byType('CASH', CASH_ALIASES);
  byType('BANK', BANK_ALIASES);
  byType('EWALLET', EWALLET_ALIASES);
  return out.sort((a, b) => b.length - a.length);
}

function findWallets(scanner: Scanner, wallets: QuickTextWallet[]): WalletHit[] {
  const hits: WalletHit[] = [];
  for (const { pattern, walletId } of walletAliases(wallets)) {
    for (const m of scanner.matches(word(`${PREPOSITIONS}(${pattern})`))) {
      const span = spanOf(m);
      if (!scanner.free(span)) continue;
      scanner.take(span);
      hits.push({ ...span, walletId, prep: m[1] ?? null });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function cleanNote(raw: string): string {
  const tokens = raw
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[,;+&]+(\s|$)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length && DANGLING.has(tokens[0]!.toLowerCase())) tokens.shift();
  while (tokens.length && DANGLING.has(tokens.at(-1)!.toLowerCase().replace(/[.,]$/, ''))) {
    tokens.pop();
  }
  const note = tokens.join(' ').replace(/^[-–:,.\s]+|[-–:,\s]+$/g, '');
  return (note.charAt(0).toUpperCase() + note.slice(1)).slice(0, 200);
}

export function parseQuickText(input: string, ctx: QuickTextContext): QuickTextResult {
  const source = input.replace(/\s+/g, ' ').trim();
  const text = canonical(source);
  // Bila ejaan merek diganti, posisi tidak lagi sejajar; catatan lalu memakai teks kanonik.
  const original = text === source.toLowerCase() ? source : text;
  const scanner = new Scanner(text);
  const found = new Set<QuickTextField>();
  let lowConfidence = false;

  // 1. Tanggal lebih dulu agar "tgl 3" dan "3/10" tidak terbaca sebagai nominal.
  let date: string | null = null;
  for (const rule of DATE_RULES) {
    const m = scanner.matches(rule.re)[0];
    if (!m) continue;
    const value = rule.resolve(m, ctx.today);
    if (!value) continue;
    scanner.take(spanOf(m));
    date = value;
    found.add('date');
    break;
  }

  // 2. Nominal: aturan berprioritas; beberapa nominal setingkat dijumlahkan ("kopi 20rb roti 15rb").
  let amount: number | null = null;
  for (const rules of AMOUNT_RULES) {
    const hits = rules.flatMap((r) => scanner.matches(r.re).map((m) => ({ m, value: r.value(m) })));
    const valid = hits.filter((h) => Number.isFinite(h.value) && h.value > 0);
    if (valid.length === 0) continue;
    const pool = rules === AMOUNT_RULES.at(-1) ? valid.slice(0, 1) : valid;
    const total = pool.reduce((sum, h) => sum + h.value, 0);
    for (const h of pool) scanner.take(spanOf(h.m));
    if (pool.length > 1) lowConfidence = true;
    if (total <= MAX_AMOUNT) {
      amount = total;
      found.add('amount');
    }
    break;
  }

  // 3. Kata kerja transfer & tarik/setor tunai.
  const transferWord = scanner.matches(TRANSFER_WORDS)[0];
  const cashOut = scanner.matches(CASH_OUT)[0];
  const cashIn = scanner.matches(CASH_IN)[0];

  // Kata kerja diambil dulu agar "tunai" di "tarik tunai" tidak terbaca sebagai dompet.
  for (const m of [transferWord, cashOut, cashIn]) if (m) scanner.take(spanOf(m));
  const hits = findWallets(scanner, ctx.wallets);
  const cashWallets = ctx.wallets.filter((w) => w.type === 'CASH');
  const cashId = cashWallets.length === 1 ? cashWallets[0]!.id : null;

  let type: TransactionType | null = null;
  let walletId: string | null = null;
  let toWalletId: string | null = null;
  const distinct = [...new Set(hits.map((h) => h.walletId))];
  const toHit = hits.find((h) => h.prep !== null && TO_PREPS.has(h.prep));
  const fromHit = hits.find((h) => h.prep !== null && FROM_PREPS.has(h.prep));
  /** Dua dompet: yang bertanda "ke" tujuan, "dari/pakai" asal; tanpa tanda, urutan kalimat. */
  const pair = () => {
    const from = fromHit ?? hits.find((h) => h.walletId !== toHit?.walletId);
    const to = toHit ?? [...hits].reverse().find((h) => h.walletId !== from?.walletId);
    return { from: from?.walletId ?? null, to: to?.walletId ?? null };
  };

  if (cashOut && (hits.length > 0 || cashId)) {
    type = 'TRANSFER';
    walletId = (fromHit ?? hits.find((h) => h.walletId !== cashId))?.walletId ?? null;
    toWalletId = toHit?.walletId ?? cashId;
  } else if (cashIn && (hits.length > 0 || cashId)) {
    type = 'TRANSFER';
    walletId = fromHit?.walletId ?? cashId;
    toWalletId = (toHit ?? hits.find((h) => h.walletId !== walletId))?.walletId ?? null;
  } else if (transferWord && hits.length > 0) {
    // "tf ke adik 100rb" tanpa dompet tujuan = pengeluaran, bukan transfer antardompet.
    const intoWallet = /top|isi|nabung/.test(transferWord[0]);
    if (distinct.length >= 2) {
      type = 'TRANSFER';
      ({ from: walletId, to: toWalletId } = pair());
    } else if (toHit || (intoWallet && !fromHit)) {
      type = 'TRANSFER';
      toWalletId = (toHit ?? hits[0]!).walletId;
    }
  } else if (distinct.length >= 2 && toHit) {
    type = 'TRANSFER';
    ({ from: walletId, to: toWalletId } = pair());
  }

  // Kata kerja transfer yang ternyata bukan transfer antardompet tetap jadi bagian catatan.
  if (type !== 'TRANSFER') {
    for (const m of [transferWord, cashOut, cashIn]) if (m) scanner.release(spanOf(m));
  }

  // 4. Pemasukan vs pengeluaran.
  const rest = scanner.rest(text);
  const usable = (id: string, t: CategoryType) =>
    ctx.categories.some((c) => c.id === id && c.type === t);
  const mentions = (name: string) => {
    const pattern = namePattern(name);
    return !!pattern && has(word(pattern), rest);
  };
  if (!type) {
    const expense = has(EXPENSE_WORDS, rest);
    const income =
      has(INCOME_WORDS, rest) ||
      hits.some((h) => h.prep?.startsWith('masuk')) ||
      ctx.categories.some((c) => c.type === 'INCOME' && mentions(c.name));
    type = income && !expense ? 'INCOME' : 'EXPENSE';
    if (income || expense) found.add('type');
    walletId = hits[0]?.walletId ?? null;
  } else {
    found.add('type');
  }
  if (walletId) found.add('wallet');
  if (toWalletId) found.add('toWallet');
  if (type === 'TRANSFER' && walletId && walletId === toWalletId) toWalletId = null;

  // 5. Catatan = sisa teks.
  const note = cleanNote(scanner.rest(original));

  // 6. Kategori: riwayat pengguna > nama kategori yang disebut > kamus kata kunci.
  let categoryId: string | null = null;
  if (type !== 'TRANSFER') {
    const suggest =
      ctx.suggestCategory ??
      ((n: string, t: CategoryType) => {
        const id = suggestCategoryByKeyword(n, t);
        return id ? { categoryId: id, source: 'keyword' as const } : null;
      });
    const suggestion = note ? suggest(note, type) : null;
    const valid = suggestion && usable(suggestion.categoryId, type) ? suggestion : null;
    const named = ctx.categories
      .filter((c) => c.type === type && mentions(c.name))
      .sort((a, b) => b.name.length - a.name.length)[0]?.id;
    categoryId =
      valid?.source === 'history' ? valid.categoryId : (named ?? valid?.categoryId ?? null);
    if (categoryId) found.add('category');
  }

  const complete =
    amount !== null && (type === 'TRANSFER' ? !!toWalletId && !!walletId : !!categoryId);
  return {
    type,
    amount,
    date,
    walletId,
    toWalletId,
    categoryId,
    note,
    found: [...found],
    confidence: complete && !lowConfidence ? 'high' : 'low',
  };
}
