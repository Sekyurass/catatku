import { Prisma } from '@prisma/client';

/**
 * Bawaan Prisma (connect_timeout 5 dtk, pool_timeout 10 dtk) terlalu ketat untuk Supabase lintas
 * negara: membuka koneksi saja ±1 dtk, dan lonjakan sesaat langsung menjadi P1001/P2024.
 */
const CONNECTION_DEFAULTS: Record<string, string> = { connect_timeout: '15', pool_timeout: '20' };

/** Tambahkan parameter koneksi yang belum ada; nilai yang sudah ditulis di URL tetap dipakai. */
export function withConnectionDefaults(url: string, extra: Record<string, string> = {}): string {
  if (!url) return url;
  const [base, query = ''] = url.split('?', 2) as [string, string?];
  const params = new URLSearchParams(query);
  const missing = Object.entries({ ...CONNECTION_DEFAULTS, ...extra }).filter(
    ([key]) => !params.has(key),
  );
  if (missing.length === 0) return url;
  const added = missing.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${base}?${query ? `${query}&` : ''}${added}`;
}

/** Gagal mendapat koneksi (server tak terjangkau / pool penuh): kuerinya belum pernah dijalankan. */
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P2024']);

export function dbErrorCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  if (err instanceof Prisma.PrismaClientInitializationError) return err.errorCode;
  return undefined;
}

export function isTransientDbError(err: unknown): boolean {
  const code = dbErrorCode(err);
  return code !== undefined && TRANSIENT_CODES.has(code);
}

/**
 * Hanya operasi baca yang diulang otomatis. Penulisan bisa berada di dalam batch `$transaction([...])`
 * yang tidak boleh diulang per operasi; kegagalannya diteruskan sebagai 503 agar klien mencoba lagi
 * (pembuatan data dilindungi Idempotency-Key).
 */
export const RETRYABLE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  '$queryRaw',
  '$queryRawUnsafe',
]);

export const RETRY_DELAYS_MS = [300, 1000];

export async function withDbRetry<T>(
  run: () => Promise<T>,
  onRetry: (err: unknown, attempt: number) => void = () => undefined,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const delay = delays[attempt];
      if (delay === undefined || !isTransientDbError(err)) throw err;
      onRetry(err, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
