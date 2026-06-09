import type { OperationalMetrics } from '../types/dashboard.types';
import { toMetricRows } from '../lib/deriveMetrics';
import { formatNumber } from '../lib/format';
import { Card } from './ui/Card';

type MetricsGridProps = {
  metrics: OperationalMetrics;
};

export function MetricsGrid({ metrics }: MetricsGridProps): React.JSX.Element {
  const rows = toMetricRows(metrics);

  return (
    <Card title="Métricas operacionais">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium text-slate-500">{row.label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">
              {formatNumber(row.value)}
            </dd>
            <dd className="mt-0.5 font-mono text-[11px] text-slate-400">
              {row.key}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
