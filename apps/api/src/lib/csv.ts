/** Karakter awal yang membuat Excel/Sheets menafsirkan sel sebagai formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Satu sel CSV (RFC 4180). Teks diawali karakter formula diberi awalan `'`
 * agar tidak dieksekusi saat dibuka di spreadsheet (CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(values: Array<string | number | null | undefined>): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}
