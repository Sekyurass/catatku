const NICE_STEPS = [
  10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000,
  25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000, 1_000_000_000,
];

/**
 * Titik sumbu Rupiah mulai 0 dengan kelipatan rapi (mis. tiap 1 jt), maks. 8 garis.
 * Dipilih langkah terkecil yang menghasilkan paling banyak `maxIntervals` interval.
 */
export function rupiahTicks(max: number, maxIntervals = 7): number[] {
  if (max <= 0) return [0, 500_000];
  const step =
    NICE_STEPS.find((s) => Math.ceil(max / s) <= maxIntervals) ??
    Math.ceil(max / maxIntervals / 1_000_000_000) * 1_000_000_000;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}
