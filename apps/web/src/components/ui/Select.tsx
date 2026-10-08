import { Check, ChevronDown } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/cn';
import { inputClass } from './Field';
import { mergeRefs, usePopover } from './usePopover';

export interface SelectOption {
  value: string;
  label: string;
  /** Teks kecil di kanan, mis. saldo dompet. */
  detail?: string;
  /** Elemen dekoratif di kiri, mis. titik warna dompet. */
  leading?: ReactNode;
  /** Opsi berurutan dengan `group` yang sama ditampilkan di bawah satu judul. */
  group?: string;
}

interface SelectProps {
  ref?: Ref<HTMLButtonElement>;
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Ditampilkan bila `value` tidak cocok dengan opsi mana pun. */
  placeholder?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
  className?: string;
}

/**
 * Pengganti <select> dengan pola ARIA "select-only combobox": fokus tetap di tombol,
 * opsi aktif ditunjuk lewat aria-activedescendant. Panah/Home/End memilih, ketik huruf
 * untuk melompat, Enter/Spasi memilih, Esc menutup tanpa ikut menutup dialog.
 */
export function Select({
  ref,
  id,
  value,
  onChange,
  options,
  placeholder = 'Pilih',
  className,
  ...aria
}: SelectProps) {
  const listId = useId();
  const { open, setOpen, anchorRef, popupRef, style } = usePopover<HTMLButtonElement>({
    matchWidth: true,
  });
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];
  const [active, setActive] = useState(0);
  const typeahead = useRef({ text: '', at: 0 });
  const optionId = (i: number) => `${listId}-${i}`;

  const show = (index = selectedIndex) => {
    setActive(Math.max(0, index));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const move = (index: number) => {
      e.preventDefault();
      if (open) setActive(Math.max(0, Math.min(last, index)));
      else show(index);
    };
    switch (e.key) {
      case 'ArrowDown':
        return open ? move(active + 1) : move(selectedIndex < 0 ? 0 : selectedIndex);
      case 'ArrowUp':
        return open ? move(active - 1) : move(selectedIndex < 0 ? 0 : selectedIndex);
      case 'Home':
        return open && move(0);
      case 'End':
        return open && move(last);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return open ? choose(active) : show();
      case 'Escape':
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        return setOpen(false);
      case 'Tab':
        return setOpen(false);
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.text = (now - t.at > 700 ? '' : t.text) + e.key.toLowerCase();
      t.at = now;
      // Huruf pertama mencari mulai opsi berikutnya (tekan "b" berulang = berpindah antar "B…").
      const start = (open ? active : Math.max(0, selectedIndex)) + (t.text.length > 1 ? 0 : 1);
      const order = options.map((_, i) => (start + i) % options.length);
      const match = order.find((i) => options[i]!.label.toLowerCase().startsWith(t.text));
      if (match !== undefined) move(match);
    }
  };

  return (
    <div className="relative">
      <button
        ref={mergeRefs(anchorRef, ref)}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        {...aria}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(
          inputClass,
          'flex items-center gap-2 pr-3 text-left',
          open && 'border-primary',
          className,
        )}
      >
        {selected?.leading}
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted/70')}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.detail && (
          <span className="shrink-0 text-sm text-muted tabular">{selected.detail}</span>
        )}
        <ChevronDown
          className={cn('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          ref={popupRef}
          style={style}
          className="z-50 flex animate-pop-in flex-col overflow-hidden rounded-control border border-line bg-surface shadow-lg"
        >
          <ul
            id={listId}
            role="listbox"
            tabIndex={-1}
            className="overflow-y-auto overscroll-contain p-1"
          >
            {options.map((option, i) => {
              const header = option.group && option.group !== options[i - 1]?.group;
              const isSelected = i === selectedIndex;
              return (
                <li key={option.value || `kosong-${i}`} role="none">
                  {header && (
                    <div
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
                    >
                      {option.group}
                    </div>
                  )}
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSelected}
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerMove={() => active !== i && setActive(i)}
                    onClick={() => {
                      choose(i);
                      anchorRef.current?.focus();
                    }}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-base',
                      i === active && 'bg-surface-muted',
                      isSelected && 'font-semibold text-primary',
                    )}
                  >
                    {option.leading}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.detail && (
                      <span className="shrink-0 text-sm font-normal text-muted tabular">
                        {option.detail}
                      </span>
                    )}
                    <Check
                      className={cn('size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                      aria-hidden
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Titik warna kecil untuk opsi dompet. */
export function ColorDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full ring-2 ring-surface"
      style={{ backgroundColor: color }}
    />
  );
}
