import { FEATURE_FLAGS } from '@catatku/shared';
import type { CategoryType, PrismaClient } from '@prisma/client';

export interface DefaultCategory {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

/** ID tetap agar seed idempoten dan bisa dirujuk lintas lingkungan. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { id: 'cat_makan', name: 'Makan', type: 'EXPENSE', icon: 'utensils', color: '#F97316' },
  { id: 'cat_transport', name: 'Transport', type: 'EXPENSE', icon: 'car', color: '#3B82F6' },
  { id: 'cat_belanja', name: 'Belanja', type: 'EXPENSE', icon: 'shopping-bag', color: '#EC4899' },
  { id: 'cat_tagihan', name: 'Tagihan', type: 'EXPENSE', icon: 'receipt', color: '#8B5CF6' },
  { id: 'cat_hiburan', name: 'Hiburan', type: 'EXPENSE', icon: 'clapperboard', color: '#EAB308' },
  {
    id: 'cat_kesehatan',
    name: 'Kesehatan',
    type: 'EXPENSE',
    icon: 'heart-pulse',
    color: '#EF4444',
  },
  {
    id: 'cat_pendidikan',
    name: 'Pendidikan',
    type: 'EXPENSE',
    icon: 'graduation-cap',
    color: '#0EA5E9',
  },
  {
    id: 'cat_lainnya_keluar',
    name: 'Lainnya',
    type: 'EXPENSE',
    icon: 'circle-ellipsis',
    color: '#64748B',
  },
  { id: 'cat_gaji', name: 'Gaji', type: 'INCOME', icon: 'banknote', color: '#16A34A' },
  {
    id: 'cat_lainnya_masuk',
    name: 'Lainnya',
    type: 'INCOME',
    icon: 'circle-ellipsis',
    color: '#64748B',
  },
];

const FLAG_DESCRIPTIONS: Record<string, string> = {
  [FEATURE_FLAGS.RECURRING_TRANSACTIONS]: 'Fase 1.1 — transaksi berulang',
  [FEATURE_FLAGS.REMINDERS]: 'Fase 1.2 — notifikasi (lonceng), pengingat harian, Web Push',
  [FEATURE_FLAGS.TEMPLATES]: 'Fase 1.3 — template / favorit',
  [FEATURE_FLAGS.CSV_IMPORT]: 'Fase 1.4 — impor CSV',
  [FEATURE_FLAGS.PWA_OFFLINE]: 'Fase 1.5 — PWA + offline',
  [FEATURE_FLAGS.RECEIPT_OCR]: 'Fase 3.1 — pindai struk (OCR di perangkat)',
  [FEATURE_FLAGS.AUTO_CATEGORY]: 'Fase 3.2 — saran kategori otomatis',
  [FEATURE_FLAGS.TAGS]: 'Fase 2.5 — tag transaksi + filter & laporan per tag',
  [FEATURE_FLAGS.ATTACHMENTS]: 'Fase 2.5 — lampiran foto (butuh STORAGE_S3_* di server)',
  [FEATURE_FLAGS.SAVINGS_GOALS]: 'Fase 2.1 — target tabungan + tab Rencana',
  [FEATURE_FLAGS.INSIGHTS]: 'Fase 2.3 — insight otomatis berbasis aturan di Beranda',
  [FEATURE_FLAGS.ADVANCED_REPORTS]: 'Fase 2.2 — halaman Laporan (bulanan/tahunan) + ekspor PDF',
  [FEATURE_FLAGS.NATURAL_INPUT]: 'Fase 3.3 — ketik cepat bahasa natural di form catat',
  [FEATURE_FLAGS.FORECAST]: 'Fase 2.4 — perkiraan saldo akhir bulan (rentang) di Beranda',
  [FEATURE_FLAGS.BANK_EMAIL]:
    'Catat dari email bank (unggah .eml; penerusan otomatis butuh INBOUND_* di server)',
};

/** Kategori default + baris feature flag (nonaktif). Aman dijalankan berulang. */
export async function seedDefaults(prisma: PrismaClient) {
  for (const c of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { id: c.id },
      create: { ...c, userId: null },
      update: { name: c.name, type: c.type, icon: c.icon, color: c.color },
    });
  }
  for (const key of Object.values(FEATURE_FLAGS)) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: false, description: FLAG_DESCRIPTIONS[key] },
      update: { description: FLAG_DESCRIPTIONS[key] },
    });
  }
}
