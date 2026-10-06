import type { NotificationPageDTO, NotificationSettingsDTO } from '@catatku/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
  settings: ['notifications', 'settings'] as const,
};

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: ({ signal }) =>
      api<{ count: number }>('/notifications/unread-count', { signal }).then((r) => r.count),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useNotificationList(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list,
    queryFn: ({ pageParam, signal }) =>
      api<NotificationPageDTO>('/notifications', {
        query: { cursor: pageParam, limit: 20 },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: notificationKeys.settings,
    queryFn: ({ signal }) => api<NotificationSettingsDTO>('/notifications/settings', { signal }),
  });
}

const relative = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
const dayMonth = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

/** "Baru saja", "5 menit yang lalu", "3 jam yang lalu", "kemarin", lalu "6 Okt". */
export function formatNotificationTime(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return relative.format(-days, 'day');
  return dayMonth.format(new Date(iso));
}
