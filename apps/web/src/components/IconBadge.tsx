import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

/** Lingkaran berlatar lembut sesuai warna kategori/dompet, berisi ikon. Dekoratif. */
export function IconBadge({
  icon: Icon,
  color,
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  color: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'md' ? 'size-10' : 'size-8',
        className,
      )}
      style={{ backgroundColor: `${color}1F`, color }}
      aria-hidden
    >
      <Icon className={size === 'md' ? 'size-5' : 'size-4'} />
    </span>
  );
}
