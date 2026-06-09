import type { CircuitBreakerState } from '../types/dashboard.types';
import { Card } from './ui/Card';

type StateConfig = {
  label: string;
  description: string;
  dot: string;
  text: string;
};

// Rótulo, descrição e cor por estado (ARCH §15).
const STATE_CONFIG: Record<CircuitBreakerState, StateConfig> = {
  CLOSED: {
    label: 'Closed',
    description: 'Operação normal — consumindo as filas.',
    dot: 'bg-circuit-closed',
    text: 'text-circuit-closed',
  },
  OPEN: {
    label: 'Open',
    description: 'Polling suspenso — instabilidade no SaaS.',
    dot: 'bg-circuit-open',
    text: 'text-circuit-open',
  },
  HALF_OPEN: {
    label: 'Half-Open',
    description: 'Testando a recuperação do parceiro.',
    dot: 'bg-circuit-halfOpen',
    text: 'text-circuit-halfOpen',
  },
};

type CircuitBreakerStatusProps = {
  state: CircuitBreakerState;
};

export function CircuitBreakerStatus({
  state,
}: CircuitBreakerStatusProps): React.JSX.Element {
  const config = STATE_CONFIG[state];

  return (
    <Card title="Circuit Breaker">
      <div className="flex items-center gap-3">
        <span
          className={`h-3 w-3 rounded-full ${config.dot}`}
          aria-hidden="true"
        />
        <span className={`text-lg font-semibold ${config.text}`}>
          {config.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500">{config.description}</p>
    </Card>
  );
}
