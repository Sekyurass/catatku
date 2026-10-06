import type { CategoryDTO } from '@catatku/shared';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { categoryIcon } from '../../lib/icons';
import { IconBadge } from '../IconBadge';

export function CategoryPicker({
  categories,
  value,
  onChange,
  error,
}: {
  categories: CategoryDTO[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-fg">Kategori</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {categories.map((c) => (
          <label
            key={c.id}
            className={cn(
              'flex min-h-11 cursor-pointer flex-col items-center gap-1 rounded-control border border-line px-1 py-2 text-center text-xs font-medium text-fg',
              'hover:bg-surface-muted has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary',
              'has-focus-visible:outline-2 has-focus-visible:outline-primary',
            )}
          >
            <input
              type="radio"
              name={name}
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
              className="sr-only"
            />
            <IconBadge icon={categoryIcon(c.icon)} color={c.color} size="sm" />
            <span className="line-clamp-2 break-words">{c.name}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-expense-text" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
