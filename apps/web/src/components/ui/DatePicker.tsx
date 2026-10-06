import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { formatMonthLabel, today } from '../../lib/format';
import { inputClass } from './Field';
import { usePopover } from './usePopover';

const WEEKDAYS = [
  ['Sen', 'Senin'],
  ['Sel', 'Selasa'],
  ['Rab', 'Rabu'],
  ['Kam', 'Kamis'],
  ['Jum', 'Jumat'],
  ['Sab', 'Sabtu'],
  ['Min', 'Minggu'],
] as const;

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function addDays(date: string, days: number) {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** Tanggal tetap sama bila ada di bulan tujuan, kalau tidak jadi tanggal terakhirnya (31 → 30). */
function addMonths(date: string, months: number) {
  const d = utc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return iso(d);
}

/** 0 = Senin … 6 = Minggu. */
const weekday = (date: string) => (utc(date).getUTCDay() + 6) % 7;

/** 6 minggu × 7 hari yang mencakup bulan dari `date`, dimulai hari Senin. */
function monthGrid(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`;
  const start = addDays(first, -weekday(first));
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}

const triggerFormat = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const fullFormat = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface DatePickerProps {
  id?: string;
  /** "YYYY-MM-DD", atau '' bila kosong. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** Tampilkan tombol "Hapus" untuk mengosongkan (mis. filter). */
  clearable?: boolean;
  placeholder?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * Kalender pengganti <input type="date">. Minggu dimulai Senin. Keyboard: panah (hari/minggu),
 * PageUp/PageDown (bulan), Home/End (awal/akhir minggu), Enter memilih, Esc menutup.
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  clearable = false,
  placeholder = 'Pilih tanggal',
  className,
  ...aria
}: DatePickerProps) {
  const { open, setOpen, anchorRef, popupRef, style } = usePopover<HTMLButtonElement>();
  const [focused, setFocused] = useState(() => value || today());
  // Fokus pindah ke grid hanya saat dibuka dan saat navigasi keyboard; tombol bulan tetap memegang fokusnya.
  const focusGrid = useRef(false);
  const outOfRange = (d: string) =>
    (min !== undefined && d < min) || (max !== undefined && d > max);
  const clamp = (d: string) => (min && d < min ? min : max && d > max ? max : d);

  const show = () => {
    focusGrid.current = true;
    setFocused(clamp(value || today()));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) anchorRef.current?.focus();
  };
  const choose = (date: string) => {
    onChange(date);
    close();
  };

  useEffect(() => {
    if (!open || !focusGrid.current) return;
    focusGrid.current = false;
    popupRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [open, focused, popupRef]);

  const onGridKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -weekday(focused)),
      End: () => addDays(focused, 6 - weekday(focused)),
    };
    const next = moves[e.key]?.();
    if (!next) return;
    e.preventDefault();
    focusGrid.current = true;
    setFocused(clamp(next));
  };

  const todayStr = today();
  const month = focused.slice(0, 7);
  const grid = monthGrid(focused);
  const canPrev = !min || addMonths(`${month}-01`, -1).slice(0, 7) >= min.slice(0, 7);
  const canNext = !max || addMonths(`${month}-01`, 1).slice(0, 7) <= max.slice(0, 7);
  const navClass =
    'flex size-11 items-center justify-center rounded-control text-fg hover:bg-surface-muted disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className={cn('relative', className)}>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...aria}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            show();
          }
        }}
        className={cn(
          inputClass,
          'flex items-center gap-2 pr-3 text-left',
          open && 'border-primary',
        )}
      >
        <CalendarDays className="size-5 shrink-0 text-muted" aria-hidden />
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted/70')}>
          {value ? triggerFormat.format(utc(value)) : placeholder}
        </span>
      </button>
      {open && (
        <div
          ref={popupRef}
          style={style}
          role="dialog"
          aria-label="Pilih tanggal"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && !popupRef.current?.contains(next) && next !== anchorRef.current) {
              close(false);
            }
          }}
          className="z-50 w-[20.5rem] max-w-[calc(100vw-1rem)] animate-pop-in overflow-y-auto rounded-card border border-line bg-surface p-2 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              className={navClass}
              disabled={!canPrev}
              onClick={() => setFocused(clamp(addMonths(focused, -1)))}
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <p className="font-semibold" aria-live="polite">
              {formatMonthLabel(month)}
            </p>
            <button
              type="button"
              className={navClass}
              disabled={!canNext}
              onClick={() => setFocused(clamp(addMonths(focused, 1)))}
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          <table
            role="grid"
            className="w-full table-fixed border-collapse"
            onKeyDown={onGridKeyDown}
          >
            <thead>
              <tr>
                {WEEKDAYS.map(([short, long], i) => (
                  <th
                    key={short}
                    scope="col"
                    abbr={long}
                    className={cn(
                      'h-8 text-xs font-medium text-muted',
                      i === 6 && 'text-expense-text',
                    )}
                  >
                    {short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week) => (
                <tr key={week[0]}>
                  {week.map((date) => {
                    const inMonth = date.startsWith(month);
                    const isSelected = date === value;
                    const isToday = date === todayStr;
                    return (
                      <td key={date} className="p-0 text-center">
                        <button
                          type="button"
                          data-date={date}
                          tabIndex={date === focused ? 0 : -1}
                          disabled={outOfRange(date)}
                          aria-label={fullFormat.format(utc(date))}
                          aria-pressed={isSelected}
                          aria-current={isToday ? 'date' : undefined}
                          onClick={() => choose(date)}
                          onFocus={() => date !== focused && setFocused(date)}
                          className={cn(
                            'mx-auto flex size-11 items-center justify-center rounded-full text-sm tabular transition-colors',
                            'disabled:cursor-not-allowed disabled:opacity-30',
                            inMonth ? 'text-fg' : 'text-muted/60',
                            !isSelected && 'hover:bg-surface-muted',
                            isToday &&
                              !isSelected &&
                              'font-bold text-primary ring-1 ring-primary/40',
                            isSelected && 'bg-primary font-semibold text-white',
                          )}
                        >
                          {Number(date.slice(8))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 flex items-center justify-between border-t border-line pt-1">
            {clearable && value ? (
              <button
                type="button"
                onClick={() => choose('')}
                className="min-h-11 rounded-control px-3 text-sm font-medium text-muted hover:bg-surface-muted hover:text-fg"
              >
                Hapus
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={outOfRange(todayStr)}
              onClick={() => choose(todayStr)}
              className="min-h-11 rounded-control px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-40"
            >
              Hari ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
