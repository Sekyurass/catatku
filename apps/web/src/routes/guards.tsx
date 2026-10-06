import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { SPLASH_FADE_MS, SplashScreen } from '../components/SplashScreen';
import { useAuth } from '../lib/auth';

export const INTRO_MS = 2000;

type IntroPhase = 'show' | 'leaving' | 'done';

/** Intro logo minimal INTRO_MS sejak area aplikasi dibuka, lalu memudar. */
function useIntro(ready: boolean): IntroPhase {
  const [startedAt] = useState(() => Date.now());
  const [phase, setPhase] = useState<IntroPhase>('show');

  useEffect(() => {
    if (!ready) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const total = reduced ? SPLASH_FADE_MS : INTRO_MS;
    const leaveIn = Math.max(0, startedAt + total - SPLASH_FADE_MS - Date.now());
    const leave = setTimeout(() => setPhase('leaving'), leaveIn);
    const done = setTimeout(() => setPhase('done'), leaveIn + SPLASH_FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [ready, startedAt]);

  return phase;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const intro = useIntro(status === 'authenticated');

  if (status === 'anonymous') {
    return <Navigate to="/masuk" replace state={{ from: location.pathname + location.search }} />;
  }
  // Splash tetap di posisi yang sama dari 'loading' sampai selesai memudar, jadi animasinya tidak restart.
  return (
    <>
      {status === 'authenticated' && <Suspense fallback={null}>{children}</Suspense>}
      {intro !== 'done' && <SplashScreen leaving={intro === 'leaving'} />}
    </>
  );
}

/**
 * `afterAuth`: tujuan bila pengguna baru saja masuk/daftar di halaman ini. Guard inilah yang
 * mengarahkan (bukan halaman), karena redirect guard selalu menang atas navigate() halaman.
 */
export function GuestOnly({ children, afterAuth }: { children: ReactNode; afterAuth?: string }) {
  const { status } = useAuth();
  const location = useLocation();
  const [sawAnonymous, setSawAnonymous] = useState(false);
  if (status === 'anonymous' && !sawAnonymous) setSawAnonymous(true);

  const splash = <SplashScreen progress={false} />;
  if (status === 'loading') return splash;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={sawAnonymous && afterAuth ? afterAuth : from} replace />;
  }
  return <Suspense fallback={splash}>{children}</Suspense>;
}
