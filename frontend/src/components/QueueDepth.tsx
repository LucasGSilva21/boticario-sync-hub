import type { QueueDepths } from '../types/dashboard.types';
import { formatNumber } from '../lib/format';
import { Card } from './ui/Card';

type QueueRow = {
  name: string;
  depth: number;
  priority: string;
  bar: string;
};

type QueueDepthProps = {
  queues: QueueDepths;
};

export function QueueDepth({ queues }: QueueDepthProps): React.JSX.Element {
  const rows: QueueRow[] = [
    {
      name: 'employee-termination-queue',
      depth: queues.termination,
      priority: 'Prioritária',
      bar: 'bg-rose-500',
    },
    {
      name: 'employee-upsert-queue',
      depth: queues.upsert,
      priority: 'Batch',
      bar: 'bg-sky-500',
    },
  ];
  // Escala das barras pelo maior valor (mínimo 1 evita divisão por zero).
  const max = Math.max(queues.termination, queues.upsert, 1);

  return (
    <Card title="Mensagens nas filas">
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-slate-600">
                {row.name}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {formatNumber(row.depth)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div
                  className={`h-2 rounded-full ${row.bar}`}
                  style={{ width: `${(row.depth / max) * 100}%` }}
                />
              </div>
              <span className="w-20 text-right text-[11px] uppercase tracking-wide text-slate-400">
                {row.priority}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
