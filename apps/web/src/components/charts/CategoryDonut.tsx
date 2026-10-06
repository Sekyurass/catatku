import { type CategoryBreakdownItem, formatRupiah } from '@catatku/shared';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatCompact } from '../../lib/format';
import { usePrefersReducedMotion } from '../../lib/motion';

/** Donut dekoratif; angka lengkapnya dibacakan lewat legenda di sampingnya. */
export default function CategoryDonut({
  items,
  total,
}: {
  items: CategoryBreakdownItem[];
  total: number;
}) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={items}
            dataKey="total"
            nameKey="name"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={items.length > 1 ? 2 : 0}
            stroke="none"
            isAnimationActive={!reduceMotion}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {items.map((item) => (
              <Cell key={item.categoryId ?? 'none'} fill={item.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-muted">Total</span>
        <span className="tabular text-lg font-bold" title={formatRupiah(total)}>
          Rp {formatCompact(total)}
        </span>
      </div>
    </div>
  );
}
