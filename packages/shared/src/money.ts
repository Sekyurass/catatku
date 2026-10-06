const rupiahNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** Format integer Rupiah menjadi "Rp 1.250.000" (negatif: "-Rp 25.000"). */
export function formatRupiah(amount: number, opts: { signed?: boolean } = {}): string {
  const abs = rupiahNumber.format(Math.abs(Math.trunc(amount)));
  if (amount < 0) return `-Rp ${abs}`;
  if (opts.signed && amount > 0) return `+Rp ${abs}`;
  return `Rp ${abs}`;
}

/** Ambil angka dari input teks Rupiah: "Rp 25.000" -> 25000. Kosong -> null. */
export function parseRupiahInput(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (digits === '') return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
