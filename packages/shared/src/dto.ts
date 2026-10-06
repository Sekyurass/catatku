import type { CategoryType, Plan, TransactionType, WalletType } from './constants';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  createdAt: string;
  /** null = belum ada foto profil. Berubah setiap foto diganti. */
  avatarUpdatedAt: string | null;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
}

export interface WalletDTO {
  id: string;
  name: string;
  type: WalletType;
  initialBalance: number;
  balance: number;
  color: string;
  archivedAt: string | null;
  createdAt: string;
  /** Waktu transaksi terakhir dicatat di dompet ini (untuk default "terakhir dipakai"). */
  lastUsedAt: string | null;
}

export interface CategoryDTO {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault: boolean;
  archivedAt: string | null;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  /** Bertanda: + uang masuk ke dompet, − uang keluar dari dompet. */
  amount: number;
  date: string;
  note: string | null;
  walletId: string;
  wallet: { id: string; name: string; color: string };
  categoryId: string | null;
  category: { id: string; name: string; icon: string; color: string } | null;
  transferGroupId: string | null;
  /** Untuk transfer: dompet di sisi lain transfer. */
  counterpartWallet: { id: string; name: string; color: string } | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPage {
  items: TransactionDTO[];
  nextCursor: string | null;
}

export interface TransferDTO {
  transferGroupId: string;
  out: TransactionDTO;
  in: TransactionDTO;
}

export interface BudgetDTO {
  /** Pengaturan anggaran yang berlaku di bulan ini (bisa warisan bulan sebelumnya); null = tanpa anggaran. */
  id: string | null;
  categoryId: string;
  category: { id: string; name: string; icon: string; color: string };
  month: string;
  /** Bulan pengaturan yang berlaku dibuat; anggaran berlanjut ke bulan berikutnya sampai diubah. */
  since: string | null;
  /** true bila bulan berikutnya sudah punya pengaturan sendiri (mis. hasil "ubah hanya bulan ini"). */
  endsThisMonth: boolean;
  limitAmount: number;
  spent: number;
  remaining: number;
  /** spent / limitAmount (0 jika limit 0). */
  ratio: number;
  status: 'ok' | 'warning' | 'over';
}

export interface BudgetMonthDTO {
  month: string;
  items: BudgetDTO[];
  totalLimit: number;
  totalSpent: number;
}

export interface SummaryDTO {
  month: string;
  totalBalance: number;
  income: number;
  expense: number;
  net: number;
  recent: TransactionDTO[];
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  total: number;
  ratio: number;
  count: number;
}

export interface CategoryBreakdownDTO {
  month: string;
  type: CategoryType;
  total: number;
  items: CategoryBreakdownItem[];
}

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
}

export interface TrendDTO {
  months: TrendPoint[];
}
