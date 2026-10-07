import {
  formatRupiah,
  type GoalDTO,
  type GoalProgress,
  goalProgress,
  type GoalStatus,
  toDateString,
} from '@catatku/shared';
import {
  CalendarOff,
  CircleCheck,
  type LucideIcon,
  PartyPopper,
  TriangleAlert,
} from 'lucide-react';
import { formatShortDate, today } from './format';

/** Warna selalu disertai ikon + teks agar status tidak hanya dibedakan lewat warna. */
export const GOAL_STATUS: Record<
  GoalStatus,
  { label: string; icon: LucideIcon; bar: string; badge: string }
> = {
  achieved: {
    label: 'Tercapai',
    icon: PartyPopper,
    bar: 'bg-income',
    badge: 'bg-income/10 text-income-badge',
  },
  on_track: {
    label: 'Sesuai rencana',
    icon: CircleCheck,
    bar: 'bg-primary',
    badge: 'bg-primary-soft text-primary',
  },
  behind: {
    label: 'Tertinggal',
    icon: TriangleAlert,
    bar: 'bg-warning',
    badge: 'bg-warning/15 text-warning-badge',
  },
  no_deadline: {
    label: 'Tanpa tenggat',
    icon: CalendarOff,
    bar: 'bg-primary',
    badge: 'bg-surface-muted text-muted',
  },
};

export function progressOf(goal: GoalDTO, date = today()): GoalProgress {
  return goalProgress({
    target: goal.targetAmount,
    saved: goal.saved,
    savedThisMonth: goal.savedThisMonth,
    deadline: goal.deadline,
    startDate: toDateString(new Date(goal.createdAt)),
    today: date,
  });
}

/** "Tenggat 31 Des 2026 · 3 bulan lagi". */
export function deadlineLabel(goal: GoalDTO, p: GoalProgress): string {
  if (!goal.deadline) return 'Tanpa tenggat';
  const date = `Tenggat ${formatShortDate(goal.deadline)}`;
  if (p.overdue) return `${date} · sudah lewat`;
  if (p.monthsLeft === 1) return `${date} · bulan ini`;
  return `${date} · ${p.monthsLeft} bulan lagi`;
}

/** Kalimat rencana: saran setoran, sisa bulan ini, atau ucapan selamat. */
export function planLines(p: GoalProgress): { main: string; sub?: string } {
  if (p.status === 'achieved') return { main: 'Target tercapai. Selamat!' };
  if (p.status === 'no_deadline') return { main: `Kurang ${formatRupiah(p.remaining)} lagi` };
  if (p.overdue) return { main: `Tenggat lewat · kurang ${formatRupiah(p.remaining)}` };
  return {
    main: `Saran setor ${formatRupiah(p.suggestedMonthly ?? 0)}/bulan`,
    sub:
      p.dueThisMonth && p.dueThisMonth > 0
        ? `Bulan ini kurang ${formatRupiah(p.dueThisMonth)}`
        : 'Setoran bulan ini sudah cukup',
  };
}
