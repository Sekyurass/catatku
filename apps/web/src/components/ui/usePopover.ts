import {
  type CSSProperties,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const GAP = 4;
const MARGIN = 8;

/**
 * Popup yang menempel ke pemicunya dengan `position: fixed`. Tetap dirender di dalam DOM
 * pemicu (bukan portal) karena konten di luar <dialog> modal tidak bisa diklik, dan fixed
 * tidak ikut terpotong oleh `overflow` sheet. Membalik ke atas bila ruang di bawah kurang.
 */
export function usePopover<A extends HTMLElement>({ matchWidth = false } = {}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<A>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const anchor = anchorRef.current;
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      const a = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const below = vh - a.bottom - GAP - MARGIN;
      const above = a.top - GAP - MARGIN;
      const height = popup.scrollHeight;
      const flip = height > below && above > below;
      const width = matchWidth ? a.width : popup.offsetWidth;
      setStyle({
        position: 'fixed',
        left: Math.max(MARGIN, Math.min(a.left, vw - width - MARGIN)),
        ...(flip ? { bottom: vh - a.top + GAP } : { top: a.bottom + GAP }),
        ...(matchWidth && { width: a.width }),
        maxHeight: Math.max(160, flip ? above : below),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [open, matchWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return { open, setOpen, close, anchorRef, popupRef, style };
}

/** Gabungkan ref internal dengan ref dari luar (mis. react-hook-form untuk fokus saat error). */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (el: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    }
  };
}
