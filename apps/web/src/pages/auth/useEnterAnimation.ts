import { useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Halaman Masuk adalah titik awal: halaman lain (Daftar, Lupa kata sandi) datang dari kanan,
 * kembali ke Masuk datang dari kiri. Kunjungan pertama (tanpa navigasi sebelumnya) cukup memudar.
 */
function enterAnimation(pathname: string, key: string) {
  if (key === 'default') return 'animate-fade-in';
  return pathname === '/masuk' ? 'animate-auth-from-left' : 'animate-auth-from-right';
}

/** Animasi masuk dihitung sekali saat dipasang, bukan setiap rute di dalamnya berganti. */
export function useEnterAnimation() {
  const { pathname, key } = useLocation();
  const [animation] = useState(() => ({
    className: enterAnimation(pathname, key),
    firstVisit: key === 'default',
  }));
  return animation;
}
