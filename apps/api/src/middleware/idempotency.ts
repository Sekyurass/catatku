import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError, validationError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { currentUserId } from './auth';

const KEY_REGEX = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_MS = 24 * 60 * 60 * 1000;
/** statusCode 0 = permintaan pertama masih diproses. */
const PENDING = 0;

const conflict = (message: string) => new AppError(409, 'IDEMPOTENCY_CONFLICT', message);

/**
 * Header `Idempotency-Key` opsional pada operasi tulis. Respons 2xx disimpan 24 jam dan
 * dikirim ulang apa adanya bila klien mengulang permintaan yang sama (mis. jaringan putus).
 */
export const idempotent: RequestHandler = async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key) return next();
  if (!KEY_REGEX.test(key)) {
    throw validationError('Idempotency-Key tidak valid', {
      'Idempotency-Key': 'Format tidak valid',
    });
  }

  const userId = currentUserId(req);
  const requestHash = createHash('sha256')
    .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
    .digest('hex');

  if (Math.random() < 0.01) {
    void prisma.idempotencyKey
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TTL_MS) } } })
      .catch((err: unknown) => logger.warn({ err }, 'idempotency cleanup failed'));
  }

  /** true jika kunci berhasil diklaim oleh permintaan ini. */
  const claim = async () => {
    const { count } = await prisma.idempotencyKey.createMany({
      data: { userId, key, requestHash, statusCode: PENDING, responseBody: {} },
      skipDuplicates: true,
    });
    return count === 1;
  };

  if (!(await claim())) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing && existing.createdAt.getTime() < Date.now() - TTL_MS) {
      await prisma.idempotencyKey.delete({ where: { id: existing.id } });
      if (!(await claim())) throw conflict('Permintaan yang sama sedang diproses');
    } else if (!existing) {
      throw conflict('Permintaan yang sama sedang diproses');
    } else if (existing.requestHash !== requestHash) {
      throw conflict('Idempotency-Key sudah dipakai untuk permintaan lain');
    } else if (existing.statusCode === PENDING) {
      throw conflict('Permintaan yang sama sedang diproses');
    } else {
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }
  }

  const sendJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const status = res.statusCode;
    const where = { userId_key: { userId, key } };
    const persist =
      status >= 200 && status < 300
        ? prisma.idempotencyKey.update({
            where,
            data: { statusCode: status, responseBody: body as Prisma.InputJsonValue },
          })
        : prisma.idempotencyKey.delete({ where });
    void persist
      .catch((err: unknown) => logger.warn({ err }, 'idempotency persist failed'))
      .finally(() => sendJson(body));
    return res;
  };
  next();
};
