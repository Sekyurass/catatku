import type {
  BankEmailKind,
  BankEmailResult,
  CategoryIcon,
  CategoryType,
  GoalContributionType,
  ImportStatus,
  NotificationType,
  Plan,
  RecurrenceFrequency,
  TransactionType,
  WalletType,
} from './constants';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  createdAt: string;
  /** null = belum ada foto profil. Berubah setiap foto diganti. */
  avatarUpdatedAt: string | null;
  /** Versi Kebijakan Privasi yang terakhir disetujui; null = belum pernah. */
  privacyVersion: string | null;
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

/** Kategori yang dipelajari dari transaksi pengguna, per kunci catatan (lihat `merchantKey`). */
export interface CategoryMapDTO {
  key: string;
  type: CategoryType;
  categoryId: string;
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
  /** Diisi bila transaksi dibuat oleh aturan transaksi berulang. */
  recurringRuleId: string | null;
  tags: TagRefDTO[];
  attachmentCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TagRefDTO {
  id: string;
  name: string;
}

export interface TagDTO extends TagRefDTO {
  /** Jumlah transaksi aktif yang memakai tag ini. */
  count: number;
}

export interface TagBreakdownDTO {
  month: string;
  type: CategoryType;
  items: { tagId: string; name: string; total: number; count: number }[];
}

export interface AttachmentDTO {
  id: string;
  transactionId: string;
  mimeType: string;
  size: number;
  createdAt: string;
  /** Tautan bertanda tangan berumur pendek; minta ulang daftar lampiran bila sudah kedaluwarsa. */
  url: string;
  expiresAt: string;
}

export interface TransactionPage {
  items: TransactionDTO[];
  nextCursor: string | null;
}

type Ref = { id: string; name: string; color: string };
type CategoryRef = Ref & { icon: string };

export interface RecurringRuleDTO {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  /** Selalu positif; arah uang mengikuti `type`. */
  amount: number;
  walletId: string;
  wallet: Ref;
  categoryId: string;
  category: CategoryRef;
  note: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  autoPost: boolean;
  paused: boolean;
  /** Tanggal kejadian berikutnya; null bila jadwal sudah melewati tanggal berakhir. */
  nextRunAt: string | null;
  createdAt: string;
}

export interface TransactionTemplateDTO {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  /** Selalu positif; null = nominal diisi setiap kali dipakai. */
  amount: number | null;
  walletId: string;
  wallet: Ref;
  categoryId: string;
  category: CategoryRef;
  /** false bila dompet atau kategorinya sudah diarsipkan; chip disembunyikan sampai diperbaiki. */
  usable: boolean;
}

export interface GoalDTO {
  id: string;
  name: string;
  targetAmount: number;
  deadline: string | null;
  icon: CategoryIcon;
  color: string;
  walletId: string | null;
  /** archivedAt diisi bila dompet tabungannya diarsipkan; setor/tarik lewat dompet itu ditolak. */
  wallet: (Ref & { archivedAt: string | null }) | null;
  /** Total setoran dikurangi penarikan. Setoran yang transfernya dihapus tidak dihitung. */
  saved: number;
  /** Bagian dari `saved` yang bertanggal di bulan berjalan (zona Asia/Jakarta). */
  savedThisMonth: number;
  contributionCount: number;
  createdAt: string;
}

export interface GoalContributionDTO {
  id: string;
  goalId: string;
  type: GoalContributionType;
  /** Selalu positif; arah dibaca dari `type`. */
  amount: number;
  date: string;
  note: string | null;
  /** Diisi bila tercatat sebagai transfer; transaksinya bisa dibuka dari riwayat. */
  transferGroupId: string | null;
  /** Dompet asal (setor) atau tujuan (tarik) dari transfer tersebut. */
  wallet: Ref | null;
  createdAt: string;
}

/** Baris yang tidak diimpor beserta alasannya. `line` = nomor baris di file. */
export interface ImportIssue {
  line: number;
  kind: 'DUPLICATE' | 'INVALID';
  message: string;
}

/** Hasil uji coba impor (belum ada yang disimpan). */
export interface ImportPreviewDTO {
  stats: { total: number; ready: number; duplicates: number; failed: number };
  /** Maksimal IMPORT_MAX_ISSUES; urut sesuai baris. */
  issues: ImportIssue[];
}

export interface ImportBatchDTO {
  id: string;
  filename: string;
  status: ImportStatus;
  walletId: string;
  wallet: Ref;
  /** skipped = duplikat yang dilewati; failed = baris tidak valid. */
  stats: { total: number; imported: number; skipped: number; failed: number };
  issues: ImportIssue[];
  createdAt: string;
  rolledBackAt: string | null;
}

/** Kejadian aturan "minta konfirmasi dulu" yang sudah jatuh tempo. */
export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Rute di aplikasi yang dibuka saat notifikasi diketuk. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Pengaturan "catat dari email bank" milik satu pengguna. */
export interface BankEmailInboxDTO {
  enabled: boolean;
  /** Alamat tujuan filter teruskan Gmail; null bila nonaktif atau server belum punya kotak masuk. */
  address: string | null;
  /** false = server belum dikonfigurasi menerima email; unggah .eml tetap bisa. */
  receiving: boolean;
  /** Dompet bawaan untuk transaksi dari email. */
  walletId: string | null;
  /** Gmail yang meminta penerusan (dari email konfirmasi Google). */
  sourceEmail: string | null;
  /** Kode konfirmasi penerusan Gmail terakhir; ditampilkan agar bisa dimasukkan di setelan Gmail. */
  forwardingCode: string | null;
  forwardingCodeAt: string | null;
  lastReceivedAt: string | null;
  lastResult: BankEmailResult | null;
  pendingCount: number;
}

/** Transaksi dari email bank yang menunggu dikonfirmasi pengguna. */
export interface BankEmailPendingDTO {
  id: string;
  /** "bca", atau domain pengirim bila dibaca dengan pembaca umum. */
  source: string;
  kind: BankEmailKind;
  type: 'INCOME' | 'EXPENSE';
  /** Rupiah utuh, positif, sudah termasuk biaya. */
  amount: number;
  /** Bagian dari amount; 0 bila tanpa biaya. */
  fee: number;
  date: string;
  /** HH:mm WIB; null bila email tidak menyebut jam. */
  time: string | null;
  /** Toko / penerima. */
  counterparty: string | null;
  /** Usulan catatan transaksi. */
  note: string;
  /** Mis. "0403****10". */
  accountHint: string | null;
  /** Usulan dompet (pengaturan dompet bawaan); null bila belum diatur. */
  walletId: string | null;
  /** false = dibaca dengan pembaca umum, cek lagi sebelum disimpan. */
  confident: boolean;
  createdAt: string;
}

/** Hasil mengunggah satu file .eml. */
export interface BankEmailUploadDTO {
  result: BankEmailResult;
  /** Terisi bila result "parsed" atau "duplicate" (transaksi yang sudah ada). */
  pending: BankEmailPendingDTO | null;
}

export interface NotificationPageDTO {
  items: NotificationDTO[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationSettingsDTO {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderDays: number[];
  push: {
    /** false bila server belum punya kunci VAPID. */
    available: boolean;
    publicKey: string | null;
  };
}

export interface PendingOccurrenceDTO {
  id: string;
  ruleId: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  note: string | null;
  wallet: Ref;
  category: CategoryRef;
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
  /** Jumlah transaksi pengeluaran kategori ini di bulan itu. */
  txCount: number;
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

export interface MonthTotals {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/** Laporan satu bulan: ringkasan, pola harian, dan pengeluaran terbesar. */
export interface MonthlyReportDTO extends MonthTotals {
  /** Hari yang dihitung untuk rata-rata: bulan lalu = jumlah harinya, bulan ini = sampai hari ini. */
  daysCounted: number;
  /** Pengeluaran ÷ daysCounted (dibulatkan); 0 untuk bulan yang belum mulai. */
  averageDaily: number;
  /** Hari dengan pengeluaran terbesar; null bila tidak ada pengeluaran. */
  busiestDay: { date: string; total: number; count: number } | null;
  /** Satu baris per tanggal di bulan itu. */
  daily: { date: string; income: number; expense: number }[];
  /** 0 = Minggu. average = total ÷ banyaknya hari itu dalam daysCounted. */
  weekdays: { weekday: number; total: number; average: number }[];
  /** Maks. 5, terbesar dulu. amount selalu positif. */
  topExpenses: {
    id: string;
    date: string;
    amount: number;
    note: string | null;
    category: { id: string; name: string; icon: string; color: string } | null;
    wallet: { id: string; name: string; color: string };
  }[];
}

export interface CompareItem {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  from: number;
  to: number;
  diff: number;
  /** diff ÷ from; null bila bulan pembanding 0. */
  change: number | null;
}

export interface CompareDTO {
  type: CategoryType;
  from: MonthTotals;
  to: MonthTotals;
  /** Urut selisih terbesar (mutlak) dulu. */
  items: CompareItem[];
}

export interface YearlyReportDTO {
  year: number;
  income: number;
  expense: number;
  net: number;
  months: MonthTotals[];
  /** Rata-rata pengeluaran per bulan yang sudah berjalan (bulan mendatang tidak dihitung). */
  averageMonthlyExpense: number;
  monthsCounted: number;
  /** Pengeluaran per kategori setahun, maks. 5. */
  topCategories: CategoryBreakdownItem[];
}
