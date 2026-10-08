import { afterEach, describe, expect, it } from 'vitest';
import { applyPageMeta, DEFAULT_TITLE, INDEXABLE_PATHS, pageMetaFor } from './pageMeta';

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');
const canonical = () =>
  document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;

afterEach(() => {
  document.head.innerHTML = '';
});

describe('pageMetaFor', () => {
  it('halaman publik boleh diindeks dengan judul sendiri', () => {
    expect(pageMetaFor('/daftar')).toMatchObject({ index: true });
    expect(pageMetaFor('/daftar').title).toMatch(/^Daftar Gratis/);
    expect(pageMetaFor('/privasi/')).toMatchObject({ title: 'Kebijakan Privasi · Catatku' });
  });

  it('halaman privat dan sekali pakai tidak diindeks', () => {
    expect(pageMetaFor('/')).toMatchObject({ title: 'Beranda · Catatku', index: false });
    expect(pageMetaFor('/atur-ulang-kata-sandi').index).toBe(false);
    expect(pageMetaFor('/tidak-ada')).toMatchObject({ title: DEFAULT_TITLE, index: false });
  });

  it('sitemap hanya berisi halaman publik', () => {
    expect(INDEXABLE_PATHS).toEqual(['/masuk', '/daftar', '/privasi']);
  });
});

describe('applyPageMeta', () => {
  it('mengisi judul, deskripsi, robots, dan canonical untuk halaman publik', () => {
    applyPageMeta('/masuk', 'https://catatku.example/');
    expect(document.title).toBe('Masuk · Catatku');
    expect(
      document.head.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toMatch(/^Masuk ke Catatku/);
    expect(robots()).toBe('index, follow');
    expect(canonical()).toBe('https://catatku.example/masuk');
  });

  it('halaman privat memakai noindex dan canonical dihapus', () => {
    applyPageMeta('/masuk', 'https://catatku.example');
    applyPageMeta('/laporan', 'https://catatku.example');
    expect(document.title).toBe('Laporan · Catatku');
    expect(robots()).toBe('noindex, nofollow');
    expect(canonical()).toBeNull();
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
  });
});
