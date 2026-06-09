import type { LogEvent } from '../types/dashboard.types';
import { formatTime } from '../lib/format';
import { StatusBadge } from './StatusBadge';
import { Card } from './ui/Card';

type EventsTableProps = {
  events: LogEvent[];
};

export function EventsTable({ events }: EventsTableProps): React.JSX.Element {
  return (
    <Card title="Eventos recentes">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-4 font-medium">Horário</th>
              <th className="py-2 pr-4 font-medium">Colaborador</th>
              <th className="py-2 pr-4 font-medium">Fluxo</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium">Erro</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr
                key={`${event.employeeId}-${event.timestamp}-${index}`}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                  {formatTime(event.timestamp)}
                </td>
                <td className="py-2 pr-4 font-medium text-slate-800">
                  {event.employeeId}
                </td>
                <td className="py-2 pr-4 text-slate-600">{event.flow}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={event.status} />
                </td>
                <td className="py-2 text-slate-400">{event.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
