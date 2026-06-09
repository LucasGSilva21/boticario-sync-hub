import type { OperationalMetrics, QueueDepths } from '../types/dashboard.types';

/** Linha de exibição de uma métrica operacional (apresentação, não domínio). */
export type MetricRow = {
  key: keyof OperationalMetrics;
  label: string;
  value: number;
};

// Rótulos pt-BR das métricas (ARCH §20), em ordem fixa de exibição.
const METRIC_LABELS: ReadonlyArray<{
  key: keyof OperationalMetrics;
  label: string;
}> = [
  { key: 'saas_requests_total', label: 'Requisições ao SaaS' },
  { key: 'saas_requests_success', label: 'Sucessos no SaaS' },
  { key: 'saas_requests_failed', label: 'Falhas no SaaS' },
  { key: 'employees_processed_total', label: 'Colaboradores processados' },
  { key: 'idempotency_rejections_total', label: 'Rejeições por idempotência' },
  { key: 'circuit_breaker_open_total', label: 'Aberturas do Circuit Breaker' },
];

/** Converte as métricas (§20) em linhas de exibição, em ordem fixa. */
export function toMetricRows(metrics: OperationalMetrics): MetricRow[] {
  return METRIC_LABELS.map(({ key, label }) => ({
    key,
    label,
    value: metrics[key],
  }));
}

/** Profundidade total das filas (termination + upsert). */
export function totalQueueDepth(queues: QueueDepths): number {
  return queues.termination + queues.upsert;
}
