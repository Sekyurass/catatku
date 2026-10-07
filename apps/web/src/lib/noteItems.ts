export interface NoteItems {
  merchant: string | null;
  items: string[];
  /** Barang yang tidak muat di catatan ("+N lainnya"). */
  more: number;
}

const MERCHANT_MAX = 40;

/**
 * Pecah catatan berformat struk ("Toko: Barang A, Barang B +2 lainnya") atau daftar berkoma
 * ("Kopi, roti") menjadi rincian barang. Catatan biasa (satu kalimat) mengembalikan null.
 * Hanya koma yang diikuti spasi yang memisah, jadi "1,5 kg" tetap utuh.
 */
export function splitNoteItems(note: string | null | undefined): NoteItems | null {
  let rest = note?.trim() ?? '';
  if (!rest) return null;
  let more = 0;
  const tail = /\s*\+(\d+) lainnya$/.exec(rest);
  if (tail) {
    more = Number(tail[1]);
    rest = rest.slice(0, tail.index);
  }
  let merchant: string | null = null;
  const colon = rest.indexOf(': ');
  if (colon > 0 && colon <= MERCHANT_MAX) {
    merchant = rest.slice(0, colon).trim();
    rest = rest.slice(colon + 2);
  }
  const items = rest
    .split(/,\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!merchant && items.length < 2 && more === 0) return null;
  return { merchant, items, more };
}
