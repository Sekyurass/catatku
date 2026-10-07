export interface NoteItem {
  name: string;
  /** Dari akhiran "Rp6.200"; null bila catatan tidak menyebut harga. */
  price: number | null;
}

export interface NoteItems {
  merchant: string | null;
  items: NoteItem[];
  /** Barang yang tidak muat di catatan ("+N lainnya"). */
  more: number;
}

const MERCHANT_MAX = 40;
const PRICE_RE = /^(.*\S)\s+Rp\s?(\d{1,3}(?:\.\d{3})+|\d+)$/i;

function parseItem(text: string): NoteItem {
  const match = PRICE_RE.exec(text);
  if (!match) return { name: text, price: null };
  return { name: match[1]!, price: Number(match[2]!.replace(/\./g, '')) };
}

/**
 * Pecah catatan berformat struk ("Toko: Barang A Rp5.000, Barang B +2 lainnya") atau daftar
 * berkoma ("Kopi, roti") menjadi rincian barang. Catatan biasa (satu kalimat) mengembalikan null.
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
    .filter(Boolean)
    .map(parseItem);
  if (!merchant && items.length < 2 && more === 0) return null;
  return { merchant, items, more };
}
