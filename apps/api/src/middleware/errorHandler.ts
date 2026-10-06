import type { ApiErrorBody } from '@catatku/shared';
import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { zodFields } from '../lib/validate';

function send(res: Response, status: number, body: ApiErrorBody) {
  res.status(status).json(body);
}

export function notFoundHandler(_req: Request, res: Response) {
  send(res, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return send(res, err.status, {
      error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
    });
  }

  if (err instanceof ZodError) {
    return send(res, 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Periksa kembali isian kamu',
        fields: zodFields(err.issues),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return send(res, 409, { error: { code: 'CONFLICT', message: 'Data sudah ada' } });
    }
    if (err.code === 'P2025') {
      return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Data tidak ditemukan' } });
    }
  }

  const bodyError = err as { type?: string; status?: number };
  if (bodyError?.type === 'entity.parse.failed') {
    return send(res, 400, {
      error: { code: 'VALIDATION_ERROR', message: 'Format JSON tidak valid' },
    });
  }
  if (bodyError?.type === 'entity.too.large') {
    return send(res, 413, {
      error: { code: 'VALIDATION_ERROR', message: 'Ukuran data terlalu besar' },
    });
  }

  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return send(res, 500, {
    error: { code: 'INTERNAL', message: 'Terjadi kendala di server. Coba lagi sebentar lagi.' },
  });
}
