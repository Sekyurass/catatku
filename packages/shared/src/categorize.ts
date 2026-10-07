import type { CategoryType } from './constants';

/**
 * Kata kunci Indonesia -> kategori bawaan. Frasa dicocokkan per kata utuh, yang terpanjang lebih
 * dulu ("telur ayam" menang atas "ayam"). Hindari kata yang terlalu umum/ambigu ("air", "susu",
 * "xl") karena saran yang salah lebih mengganggu daripada tidak ada saran.
 */
const KEYWORDS: Record<string, string[]> = {
  cat_makan: [
    'makan',
    'makanan',
    'makan siang',
    'makan malam',
    'sarapan',
    'lunch',
    'dinner',
    'breakfast',
    'nasi',
    'nasi goreng',
    'nasi padang',
    'nasi uduk',
    'nasi kuning',
    'mie',
    'mie ayam',
    'bakmi',
    'bakso',
    'soto',
    'sate',
    'ayam',
    'ayam geprek',
    'geprek',
    'chicken',
    'bebek',
    'seafood',
    'pecel',
    'pecel lele',
    'gado gado',
    'gudeg',
    'rawon',
    'rendang',
    'penyetan',
    'lalapan',
    'warteg',
    'warmindo',
    'warung makan',
    'rumah makan',
    'rm',
    'restoran',
    'resto',
    'restaurant',
    'padang',
    'kafe',
    'cafe',
    'kopi',
    'coffee',
    'kopi susu',
    'es teh',
    'es jeruk',
    'es kopi',
    'teh',
    'jus',
    'boba',
    'roti bakar',
    'bakery',
    'donat',
    'martabak',
    'gorengan',
    'cemilan',
    'camilan',
    'jajan',
    'snack',
    'pizza',
    'burger',
    'sushi',
    'ramen',
    'dimsum',
    'katering',
    'catering',
    'gofood',
    'go food',
    'grabfood',
    'grab food',
    'shopeefood',
    'shopee food',
    'kfc',
    'mcd',
    'mcdonalds',
    'burger king',
    'hokben',
    'richeese',
    'solaria',
    'gacoan',
    'mie gacoan',
    'starbucks',
    'janji jiwa',
    'kopi kenangan',
    'fore coffee',
    'point coffee',
    'chatime',
    'mixue',
    'hotways',
    'wingstop',
    'yoshinoya',
    'pizza hut',
    'domino',
  ],
  cat_transport: [
    'transport',
    'transportasi',
    'bensin',
    'bbm',
    'pertalite',
    'pertamax',
    'solar',
    'spbu',
    'pertamina',
    'shell',
    'gojek',
    'goride',
    'go ride',
    'gocar',
    'go car',
    'grab',
    'grabbike',
    'grab bike',
    'grabcar',
    'grab car',
    'maxim',
    'indrive',
    'ojek',
    'ojol',
    'taksi',
    'taxi',
    'bluebird',
    'angkot',
    'bus',
    'busway',
    'transjakarta',
    'krl',
    'commuter line',
    'mrt',
    'lrt',
    'kereta',
    'kai',
    'whoosh',
    'parkir',
    'tol',
    'e toll',
    'etoll',
    'bengkel',
    'servis motor',
    'servis mobil',
    'service motor',
    'service mobil',
    'ganti oli',
    'oli',
    'ban',
    'tambal ban',
    'cuci motor',
    'cuci mobil',
    'pesawat',
    'tiket pesawat',
    'tiket kereta',
    'travel',
  ],
  cat_belanja: [
    'belanja',
    'belanjaan',
    'indomaret',
    'alfamart',
    'alfamidi',
    'lawson',
    'familymart',
    'superindo',
    'super indo',
    'hypermart',
    'transmart',
    'carrefour',
    'giant',
    'lotte mart',
    'ranch market',
    'farmers market',
    'supermarket',
    'minimarket',
    'swalayan',
    'pasar',
    'sayur',
    'sayuran',
    'buah',
    'beras',
    'telur',
    'telur ayam',
    'minyak goreng',
    'gula',
    'tepung',
    'sembako',
    'sabun',
    'sampo',
    'shampoo',
    'deterjen',
    'pasta gigi',
    'odol',
    'tisu',
    'popok',
    'galon',
    'gas',
    'elpiji',
    'lpg',
    'shopee',
    'tokopedia',
    'lazada',
    'blibli',
    'tiktok shop',
    'zalora',
    'baju',
    'kaos',
    'kemeja',
    'celana',
    'sepatu',
    'sandal',
    'tas',
    'uniqlo',
    'ikea',
    'ace hardware',
    'informa',
    'mr diy',
    'miniso',
    'watsons',
    'toko bangunan',
    'perabot',
    'elektronik',
  ],
  cat_tagihan: [
    'tagihan',
    'listrik',
    'pln',
    'token listrik',
    'pdam',
    'tagihan air',
    'internet',
    'wifi',
    'indihome',
    'biznet',
    'first media',
    'myrepublic',
    'pulsa',
    'paket data',
    'kuota',
    'telkomsel',
    'indosat',
    'smartfren',
    'bpjs',
    'kos',
    'kost',
    'kosan',
    'kontrakan',
    'sewa',
    'sewa rumah',
    'cicilan',
    'angsuran',
    'kredit',
    'asuransi',
    'iuran',
    'ipl',
    'pajak',
    'pbb',
    'langganan',
    'admin bank',
    'biaya admin',
  ],
  cat_hiburan: [
    'hiburan',
    'nonton',
    'bioskop',
    'film',
    'xxi',
    'cgv',
    'cinepolis',
    'netflix',
    'spotify',
    'youtube premium',
    'disney',
    'vidio',
    'game',
    'steam',
    'top up game',
    'diamond',
    'karaoke',
    'konser',
    'tiket konser',
    'liburan',
    'wisata',
    'rekreasi',
    'hotel',
    'staycation',
    'villa',
    'dufan',
    'hobi',
    'playstation',
  ],
  cat_kesehatan: [
    'kesehatan',
    'obat',
    'apotek',
    'apotik',
    'kimia farma',
    'k24',
    'century',
    'guardian',
    'dokter',
    'dokter gigi',
    'klinik',
    'rumah sakit',
    'rs',
    'rsud',
    'puskesmas',
    'halodoc',
    'alodokter',
    'vitamin',
    'suplemen',
    'paracetamol',
    'periksa',
    'cek darah',
    'laboratorium',
    'prodia',
    'optik',
    'kacamata',
    'gym',
    'fitness',
    'bpjs kesehatan',
    'masker',
  ],
  cat_pendidikan: [
    'pendidikan',
    'sekolah',
    'spp',
    'uang sekolah',
    'uang pangkal',
    'kuliah',
    'ukt',
    'kampus',
    'les',
    'kursus',
    'bimbel',
    'buku',
    'buku tulis',
    'alat tulis',
    'atk',
    'gramedia',
    'seminar',
    'pelatihan',
    'webinar',
    'udemy',
    'coursera',
    'ruangguru',
    'zenius',
    'wisuda',
    'skripsi',
    'fotokopi',
  ],
  cat_gaji: [
    'gaji',
    'gajian',
    'salary',
    'payroll',
    'upah',
    'honor',
    'honorarium',
    'thr',
    'bonus',
    'insentif',
    'lembur',
    'tunjangan',
  ],
};

const INCOME_CATEGORIES = new Set(['cat_gaji', 'cat_lainnya_masuk']);

/** Bobot kata di nama toko (sebelum ":" pada catatan dari struk) dibanding daftar barang. */
const MERCHANT_WEIGHT = 3;

const PHRASES = Object.entries(KEYWORDS)
  .flatMap(([categoryId, words]) => words.map((phrase) => ({ phrase, categoryId })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Huruf kecil, tanda baca jadi spasi: "McDonald's Go-Food" -> "mcdonalds go food". */
export function normalizeCategoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Kata umum yang kalah dari nama merek/tempat: "langganan netflix" = hiburan, bukan tagihan. */
const WEAK_PHRASES = new Set(['langganan', 'belanja', 'belanjaan', 'makan', 'makanan']);

function score(text: string, weight: number, scores: Map<string, number>) {
  let padded = ` ${normalizeCategoryText(text)} `;
  for (const { phrase, categoryId } of PHRASES) {
    const needle = ` ${phrase} `;
    if (!padded.includes(needle)) continue;
    const value = WEAK_PHRASES.has(phrase) ? weight / 2 : weight;
    scores.set(categoryId, (scores.get(categoryId) ?? 0) + value);
    padded = padded.split(needle).join('  ');
  }
}

/**
 * Tebak kategori bawaan dari catatan. Catatan dari struk ("Toko: Barang A, Barang B") memberi
 * bobot lebih pada nama toko. Hasil null bila tidak ada kata kunci yang cocok.
 */
export function suggestCategoryByKeyword(note: string, type: CategoryType): string | null {
  const scores = new Map<string, number>();
  const colon = note.indexOf(':');
  if (colon > 0) {
    score(note.slice(0, colon), MERCHANT_WEIGHT, scores);
    score(note.slice(colon + 1), 1, scores);
  } else {
    score(note, 1, scores);
  }
  let best: string | null = null;
  let bestScore = 0;
  for (const [categoryId, value] of scores) {
    if (INCOME_CATEGORIES.has(categoryId) !== (type === 'INCOME')) continue;
    if (value > bestScore) {
      best = categoryId;
      bestScore = value;
    }
  }
  return best;
}

const MAX_KEY_LENGTH = 60;

/**
 * Kunci pemetaan catatan -> kategori yang dipelajari: nama toko pada catatan dari struk, atau
 * seluruh catatan tanpa angka ("Makan siang 25rb" dan "makan siang" jadi satu kunci).
 */
export function merchantKey(note: string): string | null {
  const colon = note.indexOf(':');
  const head = colon > 0 ? note.slice(0, colon) : note;
  const key = normalizeCategoryText(head)
    .split(' ')
    .filter((w) => w && !/\d/.test(w))
    .join(' ')
    .slice(0, MAX_KEY_LENGTH)
    .trim();
  return key.length >= 2 ? key : null;
}
