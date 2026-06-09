import { SummaryCards } from './components/SummaryCards';
import { MetricsGrid } from './components/MetricsGrid';
import { CircuitBreakerStatus } from './components/CircuitBreakerStatus';
import { QueueDepth } from './components/QueueDepth';
import { EventsTable } from './components/EventsTable';
import { useDashboardData } from './hooks/useDashboardData';

export function App(): React.JSX.Element {
  const data = useDashboardData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold tracking-tight">
            Boticário Sync Hub
          </h1>
          <p className="text-sm text-slate-500">Dashboard Operacional</p>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <SummaryCards summary={data.summary} />
        <div className="grid gap-6 lg:grid-cols-3">
          <CircuitBreakerStatus state={data.circuitBreaker} />
          <div className="lg:col-span-2">
            <QueueDepth queues={data.queues} />
          </div>
        </div>
        <MetricsGrid metrics={data.metrics} />
        <EventsTable events={data.events} />
      </main>
    </div>
  );
}
