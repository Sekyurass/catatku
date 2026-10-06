import type { FeatureFlagKey } from '@catatku/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: ({ signal }) =>
      api<{ flags: Record<FeatureFlagKey, boolean> }>('/features', { signal }).then((r) => r.flags),
    staleTime: 5 * 60_000,
  });
}

/** false selama flag belum termuat, supaya fitur yang mati tidak sempat berkedip muncul. */
export function useFeature(key: FeatureFlagKey): boolean {
  return useFeatures().data?.[key] ?? false;
}
