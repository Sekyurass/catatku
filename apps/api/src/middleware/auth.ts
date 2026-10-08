import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import { getUserTimeZone, runWithTimeZone } from '../lib/userZone';

/** Sisa request berjalan di zona waktu pengguna (lihat `lib/userZone`). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = token ? verifyAccessToken(token) : null;
  if (!userId) throw unauthorized();
  req.userId = userId;
  const zone = await getUserTimeZone(userId);
  runWithTimeZone(zone, () => next());
}

/** userId dari request yang sudah melewati requireAuth. */
export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
