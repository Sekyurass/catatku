import type { CategoryIcon as IconName, WalletType } from '@catatku/shared';
import {
  ArrowLeftRight,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Car,
  CircleEllipsis,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  type LucideIcon,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react';

export const CATEGORY_ICON_COMPONENTS: Record<IconName, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  'shopping-bag': ShoppingBag,
  receipt: Receipt,
  clapperboard: Clapperboard,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  banknote: Banknote,
  'circle-ellipsis': CircleEllipsis,
  coffee: Coffee,
  home: House,
  gift: Gift,
  plane: Plane,
  smartphone: Smartphone,
  shirt: Shirt,
  baby: Baby,
  dumbbell: Dumbbell,
  'paw-print': PawPrint,
  'piggy-bank': PiggyBank,
  briefcase: Briefcase,
  'trending-up': TrendingUp,
  zap: Zap,
  fuel: Fuel,
  'book-open': BookOpen,
};

export const CATEGORY_ICON_LABELS: Record<IconName, string> = {
  utensils: 'Makanan',
  car: 'Kendaraan',
  'shopping-bag': 'Belanja',
  receipt: 'Tagihan',
  clapperboard: 'Hiburan',
  'heart-pulse': 'Kesehatan',
  'graduation-cap': 'Pendidikan',
  banknote: 'Uang',
  'circle-ellipsis': 'Lainnya',
  coffee: 'Kopi',
  home: 'Rumah',
  gift: 'Hadiah',
  plane: 'Perjalanan',
  smartphone: 'Ponsel',
  shirt: 'Pakaian',
  baby: 'Anak',
  dumbbell: 'Olahraga',
  'paw-print': 'Hewan peliharaan',
  'piggy-bank': 'Tabungan',
  briefcase: 'Pekerjaan',
  'trending-up': 'Investasi',
  zap: 'Listrik',
  fuel: 'Bensin',
  'book-open': 'Buku',
};

export const WALLET_ICONS: Record<WalletType, LucideIcon> = {
  CASH: Wallet,
  BANK: Landmark,
  EWALLET: Smartphone,
};

export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  CASH: 'Tunai',
  BANK: 'Rekening bank',
  EWALLET: 'Dompet digital',
};

export const SWATCHES: readonly { value: string; label: string }[] = [
  { value: '#0F766E', label: 'Hijau toska' },
  { value: '#2563EB', label: 'Biru' },
  { value: '#7C3AED', label: 'Ungu' },
  { value: '#DB2777', label: 'Merah muda' },
  { value: '#DC2626', label: 'Merah' },
  { value: '#EA580C', label: 'Oranye' },
  { value: '#CA8A04', label: 'Kuning' },
  { value: '#16A34A', label: 'Hijau' },
  { value: '#0891B2', label: 'Sian' },
  { value: '#64748B', label: 'Abu-abu' },
];

/** Warna saat ini tetap bisa dipilih meski bukan dari palet (mis. warna kategori bawaan). */
export function swatchesWith(current: string) {
  return SWATCHES.some((s) => s.value.toLowerCase() === current.toLowerCase())
    ? SWATCHES
    : [{ value: current, label: 'Warna saat ini' }, ...SWATCHES];
}

export function categoryIcon(name: string | undefined | null): LucideIcon {
  return CATEGORY_ICON_COMPONENTS[name as IconName] ?? CircleEllipsis;
}

export const TransferIcon = ArrowLeftRight;
