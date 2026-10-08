import { formatRupiah, type StatementPreviewDTO, type StatementRowDTO } from '@catatku/shared';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useCategories } from '../../lib/queries';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { ImportStat } from './ImportStat';

export interface StatementChoice {
  import: boolean;
  categoryId: string;
}
export type StatementChoices = Record<number, StatementChoice>;

/** Usulan awal: impor yang belum tercatat; tarik/setor tunai menunggu keputusan pengguna. */
export function initialChoices(preview: StatementPreviewDTO): StatementChoices {
  return Object.fromEntries(
    preview.rows.map((r) => [
      r.line,
      { import: r.match === null && !r.cash, categoryId: r.categoryId },
    ]),
  );
}

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatDate = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

export function StatementReviewStep({
  preview,
  walletName,
  choices,
  onChoicesChange,
  onBack,
  onSubmit,
  submitting,
}: {
  preview: StatementPreviewDTO;
  walletName: string;
  choices: StatementChoices;
  onChoicesChange: (choices: StatementChoices) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const categories = useCategories();
  const options = (type: StatementRowDTO['type']): SelectOption[] =>
    (categories.data ?? [])
      .filter((c) => c.type === type)
      .map((c) => ({ value: c.id, label: c.name, leading: <ColorDot color={c.color} /> }));
  const set = (line: number, patch: Partial<StatementChoice>) =>
    onChoicesChange({ ...choices, [line]: { ...choices[line]!, ...patch } });

  const { stats, balance } = preview;
  const fresh = preview.rows.filter((r) => !r.match);
  const matched = preview.rows.filter((r) => r.match);
  const count = preview.rows.filter((r) => choices[r.line]?.import).length;

  const renderRow = (row: StatementRowDTO) => {
    const choice = choices[row.line]!;
    const amount = row.type === 'EXPENSE' ? -row.amount : row.amount;
    return (
      <li
        key={row.line}
        className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0"
      >
        <Checkbox
          checked={choice.import}
          onChange={(v) => set(row.line, { import: v })}
          label={
            <span className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate">{row.note}</span>
              <span
                className={cn(
                  'shrink-0 font-semibold tabular',
                  row.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text',
                )}
              >
                {formatRupiah(amount, { signed: true })}
              </span>
            </span>
          }
          description={
            <span className="block truncate text-xs">
              {formatDate(row.date)}
              {row.pending && ' (belum dibukukan bank)'} · {row.description}
            </span>
          }
        />
        {row.match && (
          <p className="ml-9 text-xs text-muted">
            Sudah tercatat: {row.match.note || 'tanpa catatan'} · {formatDate(row.match.date)}
          </p>
        )}
        {row.bankEmailId && (
          <p className="ml-9 text-xs text-muted">
            Cocok dengan email bank yang menunggu konfirmasi; ikut dikonfirmasi saat diimpor.
          </p>
        )}
        {row.cash && !row.match && (
          <p className="ml-9 text-xs text-muted">
            Tarik/setor tunai. Bila uangnya masuk ke dompet tunai, lebih tepat dicatat sebagai
            transfer lewat form transaksi.
          </p>
        )}
        {choice.import && (
          <Select
            aria-label={`Kategori untuk ${row.note}`}
            value={choice.categoryId}
            onChange={(v) => set(row.line, { categoryId: v })}
            options={options(row.type)}
            className="ml-9 w-auto"
          />
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Mutasi {preview.bankName}
        {preview.accountHint && ` ${preview.accountHint}`}
        {preview.period &&
          ` · ${formatDate(preview.period.from)} – ${formatDate(preview.period.to)}`}
      </p>

      {balance?.balanced === true && (
        <p className="flex items-center gap-2 text-sm text-income-text">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Saldo awal + mutasi = saldo akhir. File lengkap.
        </p>
      )}
      {balance?.balanced === false && (
        <p className="flex items-start gap-2 text-sm text-expense-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Saldo awal + mutasi tidak sama dengan saldo akhir. Mungkin ada baris yang tidak terbaca
          atau file terpotong.
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <ImportStat label="Belum tercatat" value={stats.new} tone="ok" />
        <ImportStat label="Sudah tercatat" value={stats.matched} />
        <ImportStat
          label="Gagal dibaca"
          value={stats.failed}
          tone={stats.failed ? 'bad' : undefined}
        />
      </dl>

      {fresh.length > 0 && (
        <section aria-labelledby="mutasi-baru" className="flex flex-col gap-2">
          <h3 id="mutasi-baru" className="text-sm font-semibold">
            Belum tercatat
          </h3>
          <ul className="rounded-control border border-line">{fresh.map(renderRow)}</ul>
        </section>
      )}

      {matched.length > 0 && (
        <section aria-labelledby="mutasi-cocok" className="flex flex-col gap-2">
          <h3 id="mutasi-cocok" className="text-sm font-semibold">
            Sudah tercatat (dilewati)
          </h3>
          <p className="-mt-1 text-xs text-muted">
            Nominalnya sama dengan transaksi di dompet ini dalam selisih beberapa hari. Centang bila
            ternyata transaksi yang berbeda.
          </p>
          <ul className="rounded-control border border-line">{matched.map(renderRow)}</ul>
        </section>
      )}

      {preview.invalidLines.length > 0 && (
        <p className="text-sm text-muted">
          Baris {preview.invalidLines.slice(0, 10).join(', ')}
          {preview.invalidLines.length > 10 && ', …'} tidak terbaca dan tidak diimpor.
        </p>
      )}

      <p className="text-sm text-muted">
        {count > 0
          ? `${count.toLocaleString('id-ID')} transaksi akan dicatat ke dompet ${walletName}. Bisa dibatalkan sekaligus setelahnya.`
          : 'Belum ada baris yang dipilih untuk diimpor.'}
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onClick={onBack} disabled={submitting}>
          Kembali
        </Button>
        <Button size="lg" onClick={onSubmit} loading={submitting} disabled={count === 0}>
          Impor {count.toLocaleString('id-ID')} transaksi
        </Button>
      </div>
    </div>
  );
}
