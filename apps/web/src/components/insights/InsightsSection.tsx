import type { InsightDTO, InsightKind } from '@catatku/shared';
import {
  ChevronRight,
  Gauge,
  type LucideIcon,
  Repeat,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { queryKeys, useInsights } from '../../lib/queries';
import { IconBadge } from '../IconBadge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { InsightDetail } from './InsightDetail';

const MAX_VISIBLE = 3;

const TONE_COLOR: Record<InsightDTO['tone'], string> = {
  warning: '#D97706',
  positive: '#16A34A',
  info: '#2563EB',
};

function insightIcon(insight: InsightDTO): LucideIcon {
  const icons: Record<InsightKind, LucideIcon> = {
    category_change:
      insight.kind === 'category_change' && insight.detail.direction === 'down'
        ? TrendingDown
        : TrendingUp,
    budget_pace: Gauge,
    new_subscription: Repeat,
    unusual_expense: Sparkles,
  };
  return icons[insight.kind];
}

/** Insight otomatis di Beranda: maks 3 kartu yang bisa digeser. Tidak tampil bila kosong. */
export function InsightsSection() {
  const insights = useInsights();
  const qc = useQueryClient();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const items = insights.data ?? [];
  const opened = items.find((i) => i.id === openId) ?? null;

  const open = (insight: InsightDTO) => {
    setOpenId(insight.id);
    void api('/events', {
      method: 'POST',
      body: { name: 'insight_opened', kind: insight.kind },
    }).catch(() => undefined);
  };

  const dismiss = async (insight: InsightDTO) => {
    const url = `/insights/${encodeURIComponent(insight.id)}/dismiss`;
    const previous = qc.getQueryData<InsightDTO[]>(queryKeys.insights);
    qc.setQueryData<InsightDTO[]>(queryKeys.insights, (list) =>
      list?.filter((i) => i.id !== insight.id),
    );
    if (openId === insight.id) setOpenId(null);
    try {
      await api(url, { method: 'POST' });
      toast({
        message: 'Insight disembunyikan',
        tone: 'info',
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              await api(url, { method: 'DELETE' });
              void qc.invalidateQueries({ queryKey: queryKeys.insights });
            } catch {
              toast({ message: 'Gagal mengurungkan. Coba lagi.', tone: 'error' });
            }
          },
        },
      });
    } catch {
      qc.setQueryData(queryKeys.insights, previous);
      toast({ message: 'Gagal menyembunyikan insight. Coba lagi.', tone: 'error' });
    }
  };

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="insight-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="insight-heading" className="text-base font-semibold">
          Insight untukmu
        </h2>
        {items.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
          >
            Lihat semua ({items.length})
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <ul
        className={cn(
          '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1',
          'sm:-mx-6 sm:scroll-px-6 sm:px-6',
          'md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0',
        )}
        aria-label="Daftar insight"
      >
        {items.slice(0, MAX_VISIBLE).map((insight) => (
          <li
            key={insight.id}
            className={cn(
              'w-[85%] max-w-sm shrink-0 snap-start md:w-auto md:max-w-none',
              items.length === 1 && 'w-full max-w-none',
            )}
          >
            <InsightCard insight={insight} onOpen={open} onDismiss={dismiss} />
          </li>
        ))}
      </ul>

      <Dialog open={showAll} onClose={() => setShowAll(false)} title="Semua insight">
        <ul className="flex flex-col gap-3">
          {items.map((insight) => (
            <li key={insight.id}>
              <InsightCard
                insight={insight}
                onOpen={(i) => {
                  setShowAll(false);
                  open(i);
                }}
                onDismiss={dismiss}
              />
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={opened !== null}
        onClose={() => setOpenId(null)}
        title={opened?.title ?? 'Insight'}
      >
        {opened && (
          <InsightDetail
            insight={opened}
            onDismiss={() => void dismiss(opened)}
            onClose={() => setOpenId(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function InsightCard({
  insight,
  onOpen,
  onDismiss,
}: {
  insight: InsightDTO;
  onOpen: (insight: InsightDTO) => void;
  onDismiss: (insight: InsightDTO) => void;
}) {
  return (
    <article className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <IconBadge icon={insightIcon(insight)} color={TONE_COLOR[insight.tone]} size="sm" />
        <h3 className="min-w-0 flex-1 pt-1 text-sm font-semibold">{insight.title}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="-mt-2 -mr-2 shrink-0 text-muted"
          onClick={() => onDismiss(insight)}
          aria-label={`Sembunyikan insight: ${insight.title}`}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="line-clamp-3 flex-1 text-sm text-muted">{insight.body}</p>
      <button
        type="button"
        onClick={() => onOpen(insight)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-control px-2 text-sm font-semibold text-primary hover:bg-primary-soft"
        aria-label={`Lihat detail: ${insight.title}`}
      >
        Lihat detail
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </article>
  );
}
