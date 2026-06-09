import type { EventStatus } from '../types/dashboard.types';

// Cor semântica por status (tokens do tailwind.config.ts; §19).
const STATUS_STYLES: Record<EventStatus, string> = {
  SUCCESS: 'bg-status-success/10 text-status-success',
  ERROR: 'bg-status-error/10 text-status-error',
  RETRY: 'bg-status-retry/10 text-status-retry',
  SKIPPED: 'bg-status-skipped/10 text-status-skipped',
};

type StatusBadgeProps = {
  status: EventStatus;
};

export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
