import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Lama tampil dalam ms (default 4000). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: TriangleAlert };
const iconColor = {
  success: 'text-income',
  error: 'text-expense',
  info: 'text-primary',
  warning: 'text-amber-400',
};

/** Semua toast dibuang saat `resetKey` berubah (mis. pengguna keluar) agar aksi lama tidak terbawa. */
export function ToastProvider({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  const nextId = useRef(1);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setToasts([]);
  }

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      setTimeout(() => dismiss(id), input.duration ?? 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const tone = t.tone ?? 'success';
          const Icon = icons[tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-control bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
            >
              <Icon className={cn('size-5 shrink-0', iconColor[tone])} aria-hidden />
              <span className="flex-1">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="min-h-11 rounded-control px-2 font-semibold text-teal-300 hover:text-teal-200"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-control text-slate-300 hover:text-white"
                onClick={() => dismiss(t.id)}
                aria-label="Tutup notifikasi"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return ctx;
}
