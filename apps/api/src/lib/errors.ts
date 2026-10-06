import type { ErrorCode } from '@catatku/shared';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Data') =>
  new AppError(404, 'NOT_FOUND', `${what} tidak ditemukan`);

export const validationError = (message: string, fields?: Record<string, string>) =>
  new AppError(400, 'VALIDATION_ERROR', message, fields);

export const unauthorized = (message = 'Sesi berakhir, silakan masuk lagi') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError(409, 'CONFLICT', message, fields);
