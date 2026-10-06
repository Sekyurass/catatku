import { formatRupiah, type TrendPoint } from '@catatku/shared';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatMonthLabel, formatMonthShort } from '../../lib/format';
import { usePrefersReducedMotion } from '../../lib/motion';

const SERIES = [
  { key: 'income', name: 'Pemasukan', color: 'var(--income)' },
  { key: 'expense', name: 'Pengeluaran', color: 'var(--expense)' },
] as const;

/**
 * Grafik batang dekoratif; data yang sama tersedia sebagai tabel untuk pembaca layar.
 * Mengisi penuh induknya, jadi induk harus `relative` dan punya tinggi.
 */
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const reduceMotion = usePrefersReducedMotion();
  const data = points.map((p) => ({ ...p, label: formatMonthShort(p.month) }));
  return (
    <div className="absolute inset-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-muted)' }}
            formatter={(value) => formatRupiah(Number(value))}
            labelFormatter={(_, payload) => {
              const month = payload?.[0]?.payload?.month as string | undefined;
              return month ? formatMonthLabel(month) : '';
            }}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              isAnimationActive={!reduceMotion}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
