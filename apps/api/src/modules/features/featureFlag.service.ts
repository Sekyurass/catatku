import { FEATURE_FLAGS, type FeatureFlagKey } from '@catatku/shared';
import type { FeatureFlag, Plan } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';

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

export async function getFlagsForUser(userId: string): Promise<Record<FeatureFlagKey, boolean>> {
  const [user, flags] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, plan: true } }),
    prisma.featureFlag.findMany(),
  ]);
  const byKey = new Map(flags.map((f) => [f.key, f]));
  const result = {} as Record<FeatureFlagKey, boolean>;
  for (const key of Object.values(FEATURE_FLAGS)) {
    const flag = byKey.get(key) ?? { key, enabled: false, plan: null, userIds: [] };
    result[key] = evaluateFlag(flag, user);
  }
  return result;
}

export async function isFeatureEnabled(key: FeatureFlagKey, userId: string): Promise<boolean> {
  return (await getFlagsForUser(userId))[key];
}
