/** Konversi BigInt Rupiah dari DB ke number untuk JSON. Aman sampai ±9 kuadriliun. */
export function toNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Nilai uang di luar batas aman: ${value}`);
  return n;
}

/** "YYYY-MM-DD" -> Date UTC tengah malam, sesuai kolom @db.Date. */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
