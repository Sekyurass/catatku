import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { AuthShell } from './AuthLayout';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { useEnterAnimation } from './useEnterAnimation';

const MODES = [
  {
    mode: 'login',
    Form: LoginForm,
    prompt: 'Belum punya akun?',
    switchTo: { path: '/daftar', label: 'Daftar gratis' },
  },
  {
    mode: 'register',
    Form: RegisterForm,
    prompt: 'Sudah punya akun?',
    switchTo: { path: '/masuk', label: 'Masuk' },
  },
] as const;
type Mode = (typeof MODES)[number]['mode'];

const SLIDE_MS = 500;
const SLIDE = 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

/**
 * Masuk dan Daftar satu halaman (pindah lewat tautan di bawah): kedua form berjejer dan digeser
 * bersamaan, tinggi area form ikut
 * menyesuaikan. Form yang keluar tetap terpasang selama animasi lalu dilepas, supaya label
 * "Email"/"Kata sandi" tidak ganda bagi pembaca layar dan tes.
 */
export function AuthPage() {
  const location = useLocation();
  const mode: Mode = location.pathname === '/daftar' ? 'register' : 'login';
  const index = MODES.findIndex((m) => m.mode === mode);
  const { className: enter, firstVisit } = useEnterAnimation();

  const [current, setCurrent] = useState<Mode>(mode);
  const [leaving, setLeaving] = useState<Mode | null>(null);
  const [switched, setSwitched] = useState(false);
  if (current !== mode) {
    setLeaving(current);
    setCurrent(mode);
    setSwitched(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), SLIDE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  const panels = useRef<Partial<Record<Mode, HTMLDivElement | null>>>({});
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = panels.current[mode];
    if (!el) return;
    const update = () => setHeight(el.offsetHeight || undefined);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const { prompt, switchTo } = MODES[index]!;

  return (
    <AuthShell variant={mode} animateShowcase={firstVisit}>
      <div
        className={cn('mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10', enter)}
      >
        {/* -m-1/p-1 memberi ruang cincin fokus agar tidak terpotong overflow-hidden. */}
        <div
          className={cn('-m-1 overflow-hidden motion-safe:transition-[height]', SLIDE)}
          style={{ height }}
        >
          <div
            className={cn('flex w-[200%] items-start motion-safe:transition-transform', SLIDE)}
            style={{ transform: `translateX(-${index * 50}%)` }}
          >
            {MODES.map(({ mode: m, Form }) => (
              <div
                key={m}
                ref={(el) => {
                  panels.current[m] = el;
                }}
                inert={m !== mode}
                aria-hidden={m !== mode || undefined}
                className={cn(
                  'w-1/2 shrink-0 p-1 motion-safe:transition-opacity',
                  SLIDE,
                  m !== mode && 'opacity-0',
                )}
              >
                {(m === mode || m === leaving) && <Form />}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p
        key={mode}
        className={cn(
          'text-center text-sm text-muted',
          switched ? 'motion-safe:animate-fade-in' : enter,
        )}
      >
        {prompt}{' '}
        <Link
          to={switchTo.path}
          state={location.state}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {switchTo.label}
        </Link>
      </p>
    </AuthShell>
  );
}
