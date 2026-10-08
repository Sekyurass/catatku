import { FEATURE_FLAGS, type FeatureFlagKey } from '@catatku/shared';
import type { FeatureFlag, Plan } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { getStorage } from '../../lib/storage';

/** "a:on,b:off" -> Map { a => true, b => false } */
export function parseForcedFlags(raw: string): Map<string, boolean> {
  const forced = new Map<string, boolean>();
  for (const part of raw.split(',')) {
    const [key, value] = part.split(':').map((s) => s.trim());
    if (key && (value === 'on' || value === 'off')) forced.set(key, value === 'on');
  }
  return forced;
}

const forced = parseForcedFlags(env.FEATURE_FLAGS_FORCE);

export function evaluateFlag(
  flag: Pick<FeatureFlag, 'key' | 'enabled' | 'plan' | 'userIds'> | undefined,
  user: { id: string; plan: Plan },
  overrides: Map<string, boolean> = forced,
): boolean {
  if (flag && overrides.has(flag.key)) return overrides.get(flag.key)!;
  if (!flag || !flag.enabled) return false;
  if (flag.userIds.includes(user.id)) return true;
  if (!flag.plan || flag.plan === 'FREE') return true;
  return user.plan === flag.plan;
}

/**
 * Flag dan paket pengguna dicek di banyak request (setiap rute ber-flag + /features), padahal jarang
 * berubah. Disimpan sebentar di memori agar tiap request tidak menambah 2 kueri ke database jarak
 * jauh. Tes mengubah flag di tengah jalan, jadi cache mati saat NODE_ENV=test.
 */
const CACHE_MS = env.isTest ? 0 : 30_000;
const MAX_CACHED_USERS = 1_000;

type FlagRow = Pick<FeatureFlag, 'key' | 'enabled' | 'plan' | 'userIds'>;
let flagCache: { until: number; rows: Promise<FlagRow[]> } | null = null;
const planCache = new Map<string, { until: number; plan: Promise<Plan> }>();

function loadFlags(): Promise<FlagRow[]> {
  const now = Date.now();
  if (flagCache && flagCache.until > now) return flagCache.rows;
  const rows = Promise.resolve(
    prisma.featureFlag.findMany({
      select: { key: true, enabled: true, plan: true, userIds: true },
    }),
  );
  flagCache = { until: now + CACHE_MS, rows };
  rows.catch(() => (flagCache = null));
  return rows;
}

function loadPlan(userId: string): Promise<Plan> {
  const now = Date.now();
  const hit = planCache.get(userId);
  if (hit && hit.until > now) return hit.plan;
  const plan = prisma.user
    .findUniqueOrThrow({ where: { id: userId }, select: { plan: true } })
    .then((u) => u.plan);
  if (CACHE_MS > 0) {
    if (planCache.size >= MAX_CACHED_USERS) planCache.clear();
    planCache.set(userId, { until: now + CACHE_MS, plan });
    plan.catch(() => planCache.delete(userId));
  }
  return plan;
}

export async function getFlagsForUser(userId: string): Promise<Record<FeatureFlagKey, boolean>> {
  const [plan, flags] = await Promise.all([loadPlan(userId), loadFlags()]);
  const user = { id: userId, plan };
  const byKey = new Map(flags.map((f) => [f.key, f]));
  const result = {} as Record<FeatureFlagKey, boolean>;
  for (const key of Object.values(FEATURE_FLAGS)) {
    const flag = byKey.get(key) ?? { key, enabled: false, plan: null, userIds: [] };
    result[key] = evaluateFlag(flag, user);
  }
  if (!getStorage()) result[FEATURE_FLAGS.ATTACHMENTS] = false;
  return result;
}

export async function isFeatureEnabled(key: FeatureFlagKey, userId: string): Promise<boolean> {
  return (await getFlagsForUser(userId))[key];
}

/** Versi massal untuk job latar: satu kueri flag untuk semua pengguna, bukan dua per pengguna. */
export async function filterUsersWithFeatures<U extends { id: string; plan: Plan }>(
  users: U[],
  keys: FeatureFlagKey[],
): Promise<U[]> {
  const flags = await loadFlags();
  const byKey = new Map(flags.map((f) => [f.key, f]));
  return users.filter((user) =>
    keys.every((key) =>
      evaluateFlag(byKey.get(key) ?? { key, enabled: false, plan: null, userIds: [] }, user),
    ),
  );
}
