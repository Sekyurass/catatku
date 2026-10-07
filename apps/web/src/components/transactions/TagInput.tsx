import { cleanTagName, MAX_TAGS_PER_TRANSACTION, TAG_NAME_MAX, tagKey } from '@catatku/shared';
import { Hash, X } from 'lucide-react';
import { type KeyboardEvent, useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { useTags } from '../../lib/queries';
import { inputClass } from '../ui/Field';

const MAX_SUGGESTIONS = 6;

/**
 * Tag sebagai chip: ketik lalu Enter/koma untuk menambah, Backspace di kolom kosong menghapus
 * yang terakhir. Tag yang pernah dipakai muncul sebagai saran satu tap.
 */
export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [text, setText] = useState('');
  const tags = useTags();
  const full = value.length >= MAX_TAGS_PER_TRANSACTION;
  const chosen = new Set(value.map(tagKey));

  const add = (raw: string) => {
    const name = cleanTagName(raw).slice(0, TAG_NAME_MAX);
    setText('');
    if (!name || full || chosen.has(tagKey(name))) return;
    onChange([...value, name]);
  };
  const remove = (name: string) => onChange(value.filter((n) => n !== name));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      remove(value[value.length - 1]!);
    }
  };

  const query = tagKey(text);
  const suggestions = (tags.data ?? [])
    .filter((t) => !chosen.has(tagKey(t.name)) && (!query || tagKey(t.name).includes(query)))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_SUGGESTIONS);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        Tag (opsional)
      </label>
      <div
        className={cn(
          inputClass,
          'flex min-h-11 flex-wrap items-center gap-x-1.5 px-2 py-0 focus-within:border-primary',
        )}
      >
        {value.map((name) => (
          <span
            key={name}
            className="my-1.5 inline-flex h-8 items-center rounded-full bg-primary-soft pl-2.5 text-sm font-medium text-primary"
          >
            {name}
            <button
              type="button"
              onClick={() => remove(name)}
              aria-label={`Hapus tag ${name}`}
              className="group -my-1.5 -ml-1.5 flex size-11 items-center justify-center rounded-full"
            >
              <span className="flex size-6 items-center justify-center rounded-full group-hover:bg-primary/15">
                <X className="size-3.5" aria-hidden />
              </span>
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            if (next.endsWith(',')) add(next.slice(0, -1));
            else setText(next);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add(text)}
          disabled={full}
          maxLength={TAG_NAME_MAX + 1}
          enterKeyHint="done"
          aria-describedby={hintId}
          placeholder={value.length === 0 ? 'Mis. liburan, kantor' : full ? '' : 'Tambah tag'}
          className="h-11 min-w-24 flex-1 bg-transparent px-1 py-0 text-base outline-none placeholder:text-muted/70"
        />
      </div>
      <p id={hintId} className="text-xs text-muted">
        {full
          ? `Maksimal ${MAX_TAGS_PER_TRANSACTION} tag.`
          : 'Tekan Enter atau koma untuk menambah. Berguna untuk mengelompokkan, mis. per acara.'}
      </p>
      {!full && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tag yang pernah dipakai">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => add(t.name)}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line px-3 text-sm text-fg hover:bg-surface-muted"
            >
              <Hash className="size-3.5 text-muted" aria-hidden />
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
