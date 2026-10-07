import { Prisma } from '@prisma/client';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { isTransientDbError, withConnectionDefaults, withDbRetry } from '../src/lib/dbConnection';
import { errorHandler } from '../src/middleware/errorHandler';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '6' });

describe('database tak terjangkau', () => {
  it('dibalas 503 + Retry-After, bukan 500', async () => {
    const app = express();
    app.get('/x', () => {
      throw known('P1001');
    });
    app.use(errorHandler);
    const res = await request(app).get('/x');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('3');
    expect(res.body).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Koneksi ke database sedang terganggu. Coba lagi sebentar lagi.',
      },
    });
  });
});

describe('withConnectionDefaults', () => {
  it('menambah timeout yang belum ada tanpa mengubah bagian lain URL', () => {
    expect(withConnectionDefaults('postgresql://u:p%40ss@h:6543/db?pgbouncer=true')).toBe(
      'postgresql://u:p%40ss@h:6543/db?pgbouncer=true&connect_timeout=15&pool_timeout=20',
    );
    expect(withConnectionDefaults('postgresql://u:p@h/db', { connection_limit: '5' })).toBe(
      'postgresql://u:p@h/db?connect_timeout=15&pool_timeout=20&connection_limit=5',
    );
  });

  it('menghormati nilai yang sudah ditulis di URL', () => {
    const url = 'postgresql://u:p@h/db?connect_timeout=30&pool_timeout=5&connection_limit=10';
    expect(withConnectionDefaults(url, { connection_limit: '5' })).toBe(url);
    expect(withConnectionDefaults('')).toBe('');
  });
});

describe('withDbRetry', () => {
  it('mengulang kegagalan koneksi lalu berhasil', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(known('P1001'))
      .mockRejectedValueOnce(known('P2024'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();
    await expect(withDbRetry(run, onRetry, [0, 0])).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map(([, attempt]) => attempt)).toEqual([1, 2]);
  });

  it('menyerah setelah jatah ulang habis', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(known('P1001'));
    await expect(withDbRetry(run, undefined, [0])).rejects.toMatchObject({ code: 'P1001' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('tidak mengulang error data (mis. unik bentrok)', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(known('P2002'));
    await expect(withDbRetry(run, undefined, [0, 0])).rejects.toMatchObject({ code: 'P2002' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('mengenali error inisialisasi koneksi', () => {
    expect(isTransientDbError(new Prisma.PrismaClientInitializationError('x', '6', 'P1001'))).toBe(
      true,
    );
    expect(isTransientDbError(new Prisma.PrismaClientInitializationError('x', '6', 'P1000'))).toBe(
      false,
    );
    expect(isTransientDbError(new Error('P1001'))).toBe(false);
  });
});
