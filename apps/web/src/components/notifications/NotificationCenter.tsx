import { FEATURE_FLAGS, type NotificationDTO, type NotificationType } from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  type LucideIcon,
  PencilLine,
  Repeat,
  Settings2,
} from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useFeature } from '../../lib/features';
import {
  formatNotificationTime,
  notificationKeys,
  useNotificationList,
  useUnreadCount,
} from '../../lib/notifications';
import { IconBadge } from '../IconBadge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';

interface NotificationCenterApi {
  enabled: boolean;
  unread: number;
  open: () => void;
}

const NotificationCenterContext = createContext<NotificationCenterApi | null>(null);

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; color: string }> = {
  REMINDER: { icon: PencilLine, color: '#0F766E' },
  RECURRING_PENDING: { icon: Clock, color: '#D97706' },
  RECURRING_POSTED: { icon: Repeat, color: '#2563EB' },
};

/** Hanya rute di dalam aplikasi; tautan lain dari mana pun diabaikan. */
const isAppLink = (link: unknown): link is string =>
  typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');

/** Lonceng untuk seluruh aplikasi: jumlah belum dibaca, panel daftar, dan jembatan pesan dari service worker. */
export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const enabled = useFeature(FEATURE_FLAGS.REMINDERS);
  const unread = useUnreadCount(enabled);
  const [isOpen, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; link?: unknown } | null;
      if (data?.type === 'catatku:notification') {
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      } else if (data?.type === 'catatku:navigate' && isAppLink(data.link)) {
        navigate(data.link);
      }
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, [queryClient, navigate]);

  const value = useMemo(
    () => ({ enabled, unread: unread.data ?? 0, open: () => setOpen(true) }),
    [enabled, unread.data],
  );

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onClose={() => setOpen(false)} title="Notifikasi">
        <NotificationPanel onClose={() => setOpen(false)} />
      </Dialog>
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const ctx = useContext(NotificationCenterContext);
  if (!ctx)
    throw new Error('useNotificationCenter harus dipakai di dalam NotificationCenterProvider');
  return ctx;
}

function bellLabel(unread: number) {
  return unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi';
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full bg-expense px-1 text-[11px] font-bold text-on-expense',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Tombol ikon bulat (Beranda di HP). */
export function BellButton({ className }: { className?: string }) {
  const { enabled, unread, open } = useNotificationCenter();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={bellLabel(unread)}
      className={cn(
        'relative flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-fg shadow-card hover:bg-surface-muted',
        className,
      )}
    >
      <Bell className="size-5" aria-hidden />
      <UnreadBadge count={unread} className="absolute -top-1 -right-1" />
    </button>
  );
}

/** Baris di sidebar tablet/desktop, gayanya sama dengan tautan navigasi. */
export function SideBell() {
  const { enabled, unread, open } = useNotificationCenter();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={bellLabel(unread)}
      className={cn(
        'relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-[11px] font-medium text-muted hover:bg-surface-muted hover:text-fg',
        'lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0 lg:text-sm',
      )}
    >
      <Bell className="size-5 shrink-0" aria-hidden />
      Notifikasi
      <UnreadBadge
        count={unread}
        className="max-lg:absolute max-lg:top-1 max-lg:right-3 lg:ml-auto"
      />
    </button>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const list = useNotificationList(true);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [markingAll, setMarkingAll] = useState(false);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unreadCount ?? 0;
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      await refresh();
    } finally {
      setMarkingAll(false);
    }
  };

  const openItem = (n: NotificationDTO) => {
    if (!n.readAt) {
      void api(`/notifications/${n.id}/read`, { method: 'POST' })
        .then(refresh)
        .catch(() => undefined);
    }
    onClose();
    if (isAppLink(n.link)) navigate(n.link);
  };

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat notifikasi">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (list.isError) {
    return <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />;
  }

  return (
    <div className="-mx-2 flex flex-col gap-2">
      {items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Belum ada notifikasi"
          description="Pengingat harian dan kabar transaksi berulang akan muncul di sini."
        />
      ) : (
        <>
          {unread > 0 && (
            <div className="flex justify-end px-2">
              <Button
                variant="ghost"
                onClick={markAll}
                loading={markingAll}
                icon={<CheckCheck className="size-4" aria-hidden />}
              >
                Tandai semua dibaca
              </Button>
            </div>
          )}
          <ul aria-label="Daftar notifikasi">
            {items.map((n) => {
              const { icon, color } = TYPE_ICON[n.type];
              const isUnread = !n.readAt;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      'flex min-h-16 w-full items-start gap-3 rounded-control px-2 py-2.5 text-left hover:bg-surface-muted',
                      isUnread && 'bg-primary-soft/50',
                    )}
                  >
                    <IconBadge icon={icon} color={color} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn('min-w-0 text-sm', isUnread ? 'font-bold' : 'font-medium')}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {formatNotificationTime(n.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    </span>
                    {isUnread && (
                      <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">Belum dibaca</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              onClick={() => void list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              className="mx-2"
            >
              Muat lebih banyak
            </Button>
          )}
        </>
      )}
      <Link
        to="/pengingat"
        onClick={onClose}
        className="mx-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-control text-sm font-semibold text-primary hover:bg-primary-soft"
      >
        <Settings2 className="size-4" aria-hidden />
        Atur pengingat & notifikasi
      </Link>
    </div>
  );
}
