import {
  merchantKey,
  suggestCategoryByKeyword,
  type CategoryDTO,
  type CategoryMapDTO,
  type CategoryType,
  type SuggestionSource,
} from '@catatku/shared';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queries';

export interface CategorySuggestion {
  categoryId: string;
  source: SuggestionSource;
}

/** Pilihan pengguna sebelumnya untuk catatan yang sama menang atas kamus kata kunci. */
export function suggestCategory(
  note: string,
  type: CategoryType,
  learned: CategoryMapDTO[],
  categories: CategoryDTO[],
): CategorySuggestion | null {
  const key = merchantKey(note);
  if (!key) return null;
  const usable = (id: string) =>
    categories.some((c) => c.id === id && c.type === type && !c.archivedAt);
  const hit = learned.find((m) => m.type === type && m.key === key);
  if (hit && usable(hit.categoryId)) return { categoryId: hit.categoryId, source: 'history' };
  const keyword = suggestCategoryByKeyword(note, type);
  return keyword && usable(keyword) ? { categoryId: keyword, source: 'keyword' } : null;
}

/** Server mempelajari pilihan di latar belakang; cache diperbarui langsung agar saran berikutnya tepat. */
export function rememberCategory(
  client: QueryClient,
  note: string,
  type: CategoryType,
  categoryId: string,
) {
  const key = merchantKey(note);
  if (!key) return;
  client.setQueryData<CategoryMapDTO[]>(queryKeys.learnedCategories, (prev) =>
    prev
      ? [{ key, type, categoryId }, ...prev.filter((m) => !(m.key === key && m.type === type))]
      : prev,
  );
}
