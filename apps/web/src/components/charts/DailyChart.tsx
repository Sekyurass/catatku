import { formatRupiah, type MonthlyReportDTO } from '@catatku/shared';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rupiahTicks } from '../../lib/chart';
import { formatCompact, formatLongDate } from '../../lib/format';
import { usePrefersReducedMotion } from '../../lib/motion';

/**
 * Pengeluaran per tanggal; dekoratif, angka yang sama ada di ringkasan dan tabel teks.
 * Mengisi penuh induknya, jadi induk harus `relative` dan punya tinggi.
 */
export default function DailyChart({ days }: { days: MonthlyReportDTO['daily'] }) {
  const reduceMotion = usePrefersReducedMotion();
  const data = days.map((d) => ({ ...d, label: String(Number(d.date.slice(8, 10))) }));
  const ticks = rupiahTicks(Math.max(...days.map((d) => d.expense)));
  return (
    <div className="absolute inset-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <YAxis
            width={52}
            ticks={ticks}
            domain={[0, ticks.at(-1) ?? 0]}
            interval={0}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-muted)' }}
            formatter={(value) => formatRupiah(Number(value))}
            labelFormatter={(_, payload) => {
              const date = payload?.[0]?.payload?.date as string | undefined;
              return date ? formatLongDate(date) : '';
            }}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
          <Bar
            dataKey="expense"
            name="Pengeluaran"
            fill="var(--expense)"
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
            isAnimationActive={!reduceMotion}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
