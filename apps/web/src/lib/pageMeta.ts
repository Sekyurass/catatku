export const SITE_NAME = 'Catatku';
export const DEFAULT_TITLE = 'Catatku — Catat Keuangan Pribadi dalam Hitungan Detik';
export const DEFAULT_DESCRIPTION =
  'Aplikasi catatan keuangan pribadi gratis: catat pemasukan dan pengeluaran, pindai struk, atur anggaran, dan pantau utang-piutang dalam Rupiah.';

export interface PageMeta {
  title: string;
  description: string;
  /** false = noindex: halaman privat atau sekali pakai yang tidak berguna di hasil pencarian. */
  index: boolean;
}

const PUBLIC: Record<string, Omit<PageMeta, 'index'>> = {
  '/masuk': {
    title: `Masuk · ${SITE_NAME}`,
    description:
      'Masuk ke Catatku untuk mencatat pemasukan, pengeluaran, anggaran, dan utang-piutang dalam hitungan detik.',
  },
  '/daftar': {
    title: `Daftar Gratis · ${SITE_NAME} — Aplikasi Catatan Keuangan Pribadi`,
    description:
      'Buat akun Catatku gratis. Catat keuangan harian, pindai struk belanja, atur anggaran bulanan, dan pantau utang-piutang dalam Rupiah.',
  },
  '/privasi': {
    title: `Kebijakan Privasi · ${SITE_NAME}`,
    description:
      'Bagaimana Catatku mengumpulkan, menyimpan, dan melindungi data keuangan pribadimu.',
  },
};

const PRIVATE_TITLES: Record<string, string> = {
  '/': 'Beranda',
  '/mulai': 'Mulai',
  '/transaksi': 'Transaksi',
  '/anggaran': 'Anggaran',
  '/anggaran/target': 'Target tabungan',
  '/anggaran/utang': 'Utang-piutang',
  '/dompet': 'Dompet',
  '/kategori': 'Kategori',
  '/berulang': 'Transaksi berulang',
  '/template': 'Template',
  '/tag': 'Tag',
  '/laporan': 'Laporan',
  '/impor': 'Impor CSV',
  '/email-bank': 'Catat dari email bank',
  '/pengingat': 'Pengingat & notifikasi',
  '/profil': 'Profil',
  '/lupa-kata-sandi': 'Lupa kata sandi',
  '/atur-ulang-kata-sandi': 'Atur ulang kata sandi',
};

export function pageMetaFor(pathname: string): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const pub = PUBLIC[path];
  if (pub) return { ...pub, index: true };
  const title = PRIVATE_TITLES[path];
  return {
    title: title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    index: false,
  };
}

/** Rute publik untuk sitemap.xml (dipakai juga oleh plugin di vite.config.ts). */
export const INDEXABLE_PATHS = Object.keys(PUBLIC);

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  return document.head.querySelector<HTMLElement>(selector) ?? document.head.appendChild(create());
}

export function applyPageMeta(pathname: string, siteUrl = import.meta.env.VITE_SITE_URL) {
  const meta = pageMetaFor(pathname);
  document.title = meta.title;

  upsert('meta[name="description"]', () =>
    Object.assign(document.createElement('meta'), { name: 'description' }),
  ).setAttribute('content', meta.description);

  upsert('meta[name="robots"]', () =>
    Object.assign(document.createElement('meta'), { name: 'robots' }),
  ).setAttribute('content', meta.index ? 'index, follow' : 'noindex, nofollow');

  const canonical = document.head.querySelector('link[rel="canonical"]');
  if (meta.index) {
    const href = `${(siteUrl || window.location.origin).replace(/\/$/, '')}${pathname}`;
    upsert('link[rel="canonical"]', () =>
      Object.assign(document.createElement('link'), { rel: 'canonical' }),
    ).setAttribute('href', href);
  } else {
    canonical?.remove();
  }
}
