import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn';
import { setThemePreference, type ThemePreference, useThemePreference } from '../lib/theme';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Sistem', icon: Monitor },
];

export function ThemePicker() {
  const preference = useThemePreference();
  return (
    <fieldset>
      <legend className="font-medium">Tampilan</legend>
      <p className="text-sm text-muted">"Sistem" mengikuti pengaturan terang/gelap perangkatmu.</p>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-control bg-surface-muted p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] text-sm font-medium transition-colors',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus)',
              preference === value ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setThemePreference(value)}
              className="sr-only"
            />
            <Icon className="size-4" aria-hidden />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
