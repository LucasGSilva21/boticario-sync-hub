// Contratos do dashboard — espelham o domínio do backend (employee/sync-state)
// e os requisitos de observabilidade da ARCHITECTURE (§8, §15, §19, §20).

/** Fluxo de negócio — idêntico a backend/src/types/employee.types.ts. */
export type FlowType = 'UPSERT' | 'TERMINATION';

/** Status de processamento de um evento (log §19 + totalizadores da demo). */
export type EventStatus = 'SUCCESS' | 'ERROR' | 'RETRY' | 'SKIPPED';

/** Estados do Circuit Breaker (ARCH §15). */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Evento de log estruturado emitido a cada tentativa de envio ao SaaS (§19). */
export type LogEvent = {
  timestamp: string;
  employeeId: string;
  flow: FlowType;
  status: EventStatus;
  /** Presente apenas em eventos com status ERROR. */
  error?: string;
};

/** Totalizadores consolidados — formato do printSummary da demo (runLocalDemo). */
export type SummaryTotals = {
  successes: number; // SUCCESS
  errors: number; // ERROR
  retries: number; // RETRY
  idempotency: number; // SKIPPED
};

/** Métricas operacionais (ARCH §20) — nomes canônicos preservados. */
export type OperationalMetrics = {
  saas_requests_total: number;
  saas_requests_success: number;
  saas_requests_failed: number;
  employees_processed_total: number;
  idempotency_rejections_total: number;
  circuit_breaker_open_total: number;
};

/** Profundidade das filas (ARCH §8: termination tem prioridade sobre upsert). */
export type QueueDepths = {
  termination: number; // fila prioritária
  upsert: number; // fila batch
};

/** Agregado único consumido pela tela (alimentado pelos mocks). */
export type DashboardData = {
  summary: SummaryTotals;
  metrics: OperationalMetrics;
  circuitBreaker: CircuitBreakerState;
  queues: QueueDepths;
  events: LogEvent[];
};
