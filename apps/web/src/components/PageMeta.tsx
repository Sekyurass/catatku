import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPageMeta } from '../lib/pageMeta';

/** Judul tab, deskripsi, robots, dan canonical mengikuti rute aktif. */
export function PageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    applyPageMeta(pathname);
  }, [pathname]);
  return null;
}
