import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

/** Menganimasikan perubahan tinggi isi (mis. saat jumlah baris berubah) agar tata letak tidak meloncat. */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // Padding/margin negatif 4px menjaga outline fokus tidak terpotong oleh overflow-hidden.
    <div
      className={cn('-m-1 overflow-hidden transition-[height] duration-300 ease-out', className)}
      style={{ height }}
    >
      <div ref={inner} className="p-1">
        {children}
      </div>
    </div>
  );
}
