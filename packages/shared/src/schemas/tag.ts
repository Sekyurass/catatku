import { z } from 'zod';
import { MAX_TAGS_PER_TRANSACTION, TAG_NAME_MAX } from '../constants';

/** "  #Liburan   Bali " -> "Liburan Bali": tanda # di depan dan spasi berlebih dibuang. */
export function cleanTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
}

/** Kunci unik per pengguna: "Liburan Bali" dan "liburan  bali" dianggap tag yang sama. */
export function tagKey(name: string): string {
  return cleanTagName(name).toLocaleLowerCase('id-ID');
}

export const tagNameSchema = z
  .string()
  .transform(cleanTagName)
  .pipe(
    z
      .string()
      .min(1, { error: 'Nama tag wajib diisi' })
      .max(TAG_NAME_MAX, { error: `Nama tag maksimal ${TAG_NAME_MAX} karakter` }),
  );

/** Daftar nama tag; duplikat (beda huruf besar/kecil) digabung. */
export const tagNamesSchema = z
  .array(tagNameSchema)
  .transform((names) => {
    const seen = new Set<string>();
    return names.filter((n) => {
      const key = tagKey(n);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .pipe(
    z.array(z.string()).max(MAX_TAGS_PER_TRANSACTION, {
      error: `Maksimal ${MAX_TAGS_PER_TRANSACTION} tag per transaksi`,
    }),
  );

export const renameTagSchema = z.object({ name: tagNameSchema });
export type RenameTagInput = z.input<typeof renameTagSchema>;
