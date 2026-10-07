import {
  buildImportRows,
  type DateOrder,
  type DecimalSeparator,
  formatRupiah,
  type ImportDefaultType,
  type ImportParseOptions,
} from '@catatku/shared';
import { FileText } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import { columnLabel, dataRowCount, type ImportDraft } from '../../lib/importFile';
import { useWallets } from '../../lib/queries';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';

const PREVIEW_ROWS = 20;

const DATE_ORDER_OPTIONS: SelectOption[] = [
  { value: 'DMY', label: 'Hari/Bulan/Tahun', detail: '31/12/2026' },
  { value: 'MDY', label: 'Bulan/Hari/Tahun', detail: '12/31/2026' },
  { value: 'YMD', label: 'Tahun-Bulan-Hari', detail: '2026-12-31' },
];

const DEFAULT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'SIGN', label: 'Ikuti tanda: minus = pengeluaran' },
  { value: 'EXPENSE', label: 'Semua pengeluaran' },
  { value: 'INCOME', label: 'Semua pemasukan' },
];

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

type Columns = ImportParseOptions['columns'];

export function ImportMapStep({
  draft,
  options,
  onOptionsChange,
  walletId,
  onWalletChange,
  onChangeFile,
  onNext,
  checking,
}: {
  draft: ImportDraft;
  options: ImportParseOptions;
  onOptionsChange: (options: ImportParseOptions) => void;
  walletId: string;
  onWalletChange: (id: string) => void;
  onChangeFile: () => void;
  onNext: () => void;
  checking: boolean;
}) {
  const wallets = useWallets();
  const { hasHeader, columns } = options;
  const set = (patch: Partial<ImportParseOptions>) => onOptionsChange({ ...options, ...patch });
  const setColumn = (key: keyof Columns, value: string) =>
    set({ columns: { ...columns, [key]: value === '' ? null : Number(value) } });

  const firstData = draft.rows[hasHeader ? 1 : 0]?.cells ?? [];
  const columnOptions: SelectOption[] = Array.from({ length: draft.width }, (_, i) => ({
    value: String(i),
    label: columnLabel(draft, i, hasHeader),
    detail: firstData[i] ? truncate(firstData[i]!, 14) : undefined,
  }));
  const optional = [{ value: '', label: 'Tidak ada' }, ...columnOptions];

  const preview = useMemo(
    () => buildImportRows(draft.rows.slice(0, (hasHeader ? 1 : 0) + PREVIEW_ROWS), options),
    [draft.rows, hasHeader, options],
  );
  const sameColumn = columns.date === columns.amount;
  const walletOptions: SelectOption[] = (wallets.data ?? []).map((w) => ({
    value: w.id,
    label: w.name,
    leading: <ColorDot color={w.color} />,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
        <FileText className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{draft.filename}</span>
          <span className="block text-xs text-muted">
            {dataRowCount(draft, hasHeader).toLocaleString('id-ID')} baris data
          </span>
        </span>
        <Button variant="ghost" onClick={onChangeFile} className="px-3">
          Ganti file
        </Button>
      </div>

      <Checkbox
        checked={hasHeader}
        onChange={(v) => set({ hasHeader: v })}
        label="Baris pertama berisi judul kolom"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Kolom tanggal"
          error={sameColumn ? 'Tanggal dan jumlah harus kolom berbeda' : undefined}
        >
          {(a) => (
            <Select
              {...a}
              value={String(columns.date)}
              onChange={(v) => setColumn('date', v)}
              options={columnOptions}
            />
          )}
        </Field>
        <Field label="Kolom jumlah">
          {(a) => (
            <Select
              {...a}
              value={String(columns.amount)}
              onChange={(v) => setColumn('amount', v)}
              options={columnOptions}
            />
          )}
        </Field>
        <Field label="Kolom keterangan (opsional)">
          {(a) => (
            <Select
              {...a}
              value={columns.note === null ? '' : String(columns.note)}
              onChange={(v) => setColumn('note', v)}
              options={optional}
            />
          )}
        </Field>
        <Field
          label="Kolom tipe (opsional)"
          hint="Mis. Pemasukan/Pengeluaran, Kredit/Debit, CR/DB."
        >
          {(a) => (
            <Select
              {...a}
              value={columns.type === null ? '' : String(columns.type)}
              onChange={(v) => setColumn('type', v)}
              options={optional}
            />
          )}
        </Field>
        {columns.type === null && (
          <Field label="Tanpa kolom tipe, anggap">
            {(a) => (
              <Select
                {...a}
                value={options.defaultType}
                onChange={(v) => set({ defaultType: v as ImportDefaultType })}
                options={DEFAULT_TYPE_OPTIONS}
              />
            )}
          </Field>
        )}
        <Field
          label="Kolom kategori (opsional)"
          hint="Dicocokkan dengan nama kategorimu; yang tidak cocok masuk Lainnya."
        >
          {(a) => (
            <Select
              {...a}
              value={columns.category === null ? '' : String(columns.category)}
              onChange={(v) => setColumn('category', v)}
              options={optional}
            />
          )}
        </Field>
        <Field label="Format tanggal">
          {(a) => (
            <Select
              {...a}
              value={options.dateOrder}
              onChange={(v) => set({ dateOrder: v as DateOrder })}
              options={DATE_ORDER_OPTIONS}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg" aria-hidden>
            Pemisah desimal
          </span>
          <Segmented<DecimalSeparator>
            label="Pemisah desimal"
            value={options.decimal}
            onChange={(v) => set({ decimal: v })}
            options={[
              { value: 'comma', label: 'Koma · 1.500,50' },
              { value: 'dot', label: 'Titik · 1,500.50' },
            ]}
          />
        </div>
        <Field label="Masukkan ke dompet" className="sm:col-span-2">
          {(a) => (
            <Select
              {...a}
              value={walletId}
              onChange={onWalletChange}
              options={walletOptions}
              placeholder="Pilih dompet"
            />
          )}
        </Field>
      </div>

      <section aria-labelledby="pratinjau-impor" className="flex flex-col gap-2">
        <h3 id="pratinjau-impor" className="text-sm font-semibold">
          Pratinjau {Math.min(PREVIEW_ROWS, preview.length)} baris pertama
        </h3>
        <ul className="rounded-control border border-line">
          {preview.map((row) => (
            <li
              key={row.line}
              className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0"
            >
              <span className="w-10 shrink-0 text-xs text-muted tabular">#{row.line}</span>
              {row.ok ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', !row.note && 'text-muted italic')}>
                      {row.note ?? 'Tanpa keterangan'}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {dateFormat.format(new Date(`${row.date}T00:00:00Z`))}
                      {row.category && ` · ${row.category}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 font-semibold tabular',
                      row.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text',
                    )}
                  >
                    {formatRupiah(row.type === 'EXPENSE' ? -row.amount : row.amount, {
                      signed: true,
                    })}
                  </span>
                </>
              ) : (
                <span className="min-w-0 flex-1 text-expense-text">{row.reason}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Button
        size="lg"
        onClick={onNext}
        loading={checking}
        disabled={sameColumn || !walletId}
        className="w-full sm:self-end sm:w-auto"
      >
        Periksa data
      </Button>
    </div>
  );
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
