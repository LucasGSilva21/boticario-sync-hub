import type { SummaryTotals } from '../types/dashboard.types';
import { formatNumber } from '../lib/format';

type SummaryCardsProps = {
  summary: SummaryTotals;
};

type Tile = {
  label: string;
  value: number;
  accent: string;
};

export function SummaryCards({
  summary,
}: SummaryCardsProps): React.JSX.Element {
  const tiles: Tile[] = [
    {
      label: 'Sucessos',
      value: summary.successes,
      accent: 'text-status-success',
    },
    { label: 'Erros', value: summary.errors, accent: 'text-status-error' },
    {
      label: 'Retentativas',
      value: summary.retries,
      accent: 'text-status-retry',
    },
    {
      label: 'Idempotência',
      value: summary.idempotency,
      accent: 'text-status-skipped',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-slate-500">{tile.label}</p>
          <p className={`mt-2 text-3xl font-bold ${tile.accent}`}>
            {formatNumber(tile.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
