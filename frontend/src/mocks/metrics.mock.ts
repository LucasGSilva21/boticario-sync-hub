import type { OperationalMetrics } from '../types/dashboard.types';

// Métricas operacionais (ARCH §20) derivadas dos totais reais da demo
// (ver summary.mock.ts). Relações mantidas coerentes:
//   total = success + failed (59 = 42 + 17)
//   failed = retentativas + erros finais (17 = 8 + 9)
//   processed = sucessos + erros + idempotência (52 = 42 + 9 + 1)
export const metricsMock: OperationalMetrics = {
  saas_requests_total: 59,
  saas_requests_success: 42,
  saas_requests_failed: 17,
  employees_processed_total: 52,
  idempotency_rejections_total: 1,
  circuit_breaker_open_total: 1,
};
