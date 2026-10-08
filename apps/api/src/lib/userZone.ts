import { AsyncLocalStorage } from 'node:async_hooks';
import { APP_TIME_ZONE, isTimeZoneId, setTimeZoneResolver, type TimeZoneId } from '@catatku/shared';
import { prisma } from './prisma';

const CACHE_TTL_MS = 30_000;

const requestZone = new AsyncLocalStorage<TimeZoneId>();
const cache = new Map<string, { zone: TimeZoneId; at: number }>();

let installed = false;

/** `toDateString()`/`currentMonth()` tanpa zona mengikuti zona pengguna request. */
export function installTimeZoneResolver(): void {
  if (installed) return;
  installed = true;
  setTimeZoneResolver(() => requestZone.getStore() ?? APP_TIME_ZONE);
}

export const asTimeZone = (value: string | null | undefined): TimeZoneId =>
  isTimeZoneId(value) ? value : APP_TIME_ZONE;

export async function getUserTimeZone(userId: string): Promise<TimeZoneId> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.zone;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  const zone = asTimeZone(user?.timeZone);
  cache.set(userId, { zone, at: Date.now() });
  return zone;
}

export function rememberUserTimeZone(userId: string, zone: string): void {
  cache.set(userId, { zone: asTimeZone(zone), at: Date.now() });
}

export function runWithTimeZone<T>(zone: TimeZoneId, fn: () => T): T {
  return requestZone.run(zone, fn);
}
