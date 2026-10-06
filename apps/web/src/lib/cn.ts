import { twMerge } from 'tailwind-merge';

/** Gabungkan kelas; kelas belakangan menang bila bentrok (mis. `text-base` vs `text-3xl`). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
