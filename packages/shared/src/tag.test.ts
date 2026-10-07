import { describe, expect, it } from 'vitest';
import { cleanTagName, renameTagSchema, tagKey, tagNamesSchema } from './schemas/tag';

describe('nama tag', () => {
  it('membuang # di depan dan merapikan spasi', () => {
    expect(cleanTagName('  ##Liburan   Bali ')).toBe('Liburan Bali');
    expect(tagKey('Liburan  BALI')).toBe('liburan bali');
  });

  it('menggabungkan duplikat beda huruf, menjaga urutan pertama', () => {
    expect(tagNamesSchema.parse(['Kantor', '#kantor', 'Klien', 'KLIEN '])).toEqual([
      'Kantor',
      'Klien',
    ]);
  });

  it('menolak nama kosong, terlalu panjang, dan lebih dari 10 tag', () => {
    expect(tagNamesSchema.safeParse(['#']).success).toBe(false);
    expect(tagNamesSchema.safeParse(['x'.repeat(31)]).success).toBe(false);
    expect(tagNamesSchema.safeParse(Array.from({ length: 11 }, (_, i) => `t${i}`)).success).toBe(
      false,
    );
    // Duplikat tidak dihitung dua kali.
    expect(tagNamesSchema.safeParse([...Array(10).fill('a'), 'A']).success).toBe(true);
  });

  it('ganti nama memakai aturan yang sama', () => {
    expect(renameTagSchema.parse({ name: ' #Dinas  Luar ' })).toEqual({ name: 'Dinas Luar' });
  });
});
