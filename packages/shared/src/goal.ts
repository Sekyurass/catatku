export type GoalStatus = 'achieved' | 'on_track' | 'behind' | 'no_deadline';

export interface GoalProgressInput {
  target: number;
  saved: number;
  /** Bagian dari `saved` yang bertanggal di bulan `today`. */
  savedThisMonth: number;
  deadline: string | null;
  /** Tanggal target dibuat, "YYYY-MM-DD". */
  startDate: string;
  today: string;
}

export interface GoalProgress {
  remaining: number;
  /** 0–1, untuk lebar bilah progres. */
  ratio: number;
  status: GoalStatus;
  /** Bulan tersisa termasuk bulan ini; 0 bila tenggat sudah lewat; null tanpa tenggat. */
  monthsLeft: number | null;
  overdue: boolean;
  /** Saran setoran per bulan (dibulatkan ke atas ke Rp1.000); null bila tercapai/tanpa tenggat. */
  suggestedMonthly: number | null;
  /** Sisa saran bulan ini setelah dikurangi setoran bulan ini. */
  dueThisMonth: number | null;
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

const roundUpThousand = (n: number) => Math.ceil(n / 1000) * 1000;

/**
 * Progres target tabungan dengan rencana setoran rata per bulan kalender.
 *
 * - Saran per bulan dihitung dari kekurangan di AWAL bulan ini, jadi tidak mengecil setelah
 *   pengguna menyetor bulan ini; yang berkurang adalah `dueThisMonth`.
 * - "Sesuai rencana" bila tabungan sudah menyamai jalur lurus dari bulan dibuat sampai bulan
 *   tenggat, dihitung per bulan penuh yang sudah lewat. Bulan pertama selalu sesuai rencana.
 */
export function goalProgress(input: GoalProgressInput): GoalProgress {
  const { target, deadline, startDate, today } = input;
  const saved = Math.max(0, input.saved);
  const remaining = Math.max(0, target - saved);
  const ratio = target > 0 ? Math.min(1, saved / target) : 1;
  const overdue = deadline !== null && today > deadline;
  const monthsLeft =
    deadline === null ? null : overdue ? 0 : monthIndex(deadline) - monthIndex(today) + 1;
  const base = { remaining, ratio, monthsLeft, overdue };

  if (remaining === 0) {
    return { ...base, status: 'achieved', suggestedMonthly: null, dueThisMonth: null };
  }
  if (deadline === null || monthsLeft === null) {
    return { ...base, status: 'no_deadline', suggestedMonthly: null, dueThisMonth: null };
  }
  if (overdue) {
    return { ...base, status: 'behind', suggestedMonthly: remaining, dueThisMonth: remaining };
  }

  const neededAtMonthStart = Math.max(0, target - (saved - input.savedThisMonth));
  const suggestedMonthly = Math.min(
    neededAtMonthStart,
    roundUpThousand(neededAtMonthStart / monthsLeft),
  );
  const dueThisMonth = Math.min(remaining, Math.max(0, suggestedMonthly - input.savedThisMonth));

  const totalMonths = Math.max(1, monthIndex(deadline) - monthIndex(startDate) + 1);
  const elapsed = Math.min(totalMonths, Math.max(0, monthIndex(today) - monthIndex(startDate)));
  const onTrack = saved * totalMonths >= target * elapsed;

  return {
    ...base,
    status: onTrack ? 'on_track' : 'behind',
    suggestedMonthly,
    dueThisMonth,
  };
}
