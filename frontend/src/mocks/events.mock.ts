import type { LogEvent } from '../types/dashboard.types';

const SAAS_503 = 'SaaS request failed with status 503';

// Fatia recente do log estruturado (ARCH §19), extraída da execução real da
// demo (npm run start:local). Mais recentes primeiro; cobre os 5 cenários.
export const eventsMock: LogEvent[] = [
  // Cenário 5 — Idempotência (Zero-Read)
  {
    timestamp: '2026-06-09T17:04:01.642Z',
    employeeId: 'U-DUP',
    flow: 'UPSERT',
    status: 'SKIPPED',
  },
  {
    timestamp: '2026-06-09T17:04:01.640Z',
    employeeId: 'U-DUP',
    flow: 'UPSERT',
    status: 'SUCCESS',
  },
  // Cenário 4 — Circuit Breaker (recuperação após reset)
  {
    timestamp: '2026-06-09T17:04:00.637Z',
    employeeId: 'C-7',
    flow: 'UPSERT',
    status: 'SUCCESS',
  },
  {
    timestamp: '2026-06-09T17:04:00.577Z',
    employeeId: 'C-1',
    flow: 'UPSERT',
    status: 'SUCCESS',
  },
  // Cenário 4 — 5 falhas consecutivas abrem o circuito
  {
    timestamp: '2026-06-09T17:04:00.567Z',
    employeeId: 'C-5',
    flow: 'UPSERT',
    status: 'ERROR',
    error: SAAS_503,
  },
  {
    timestamp: '2026-06-09T17:04:00.528Z',
    employeeId: 'C-1',
    flow: 'UPSERT',
    status: 'ERROR',
    error: SAAS_503,
  },
  // Cenário 3 — Falha definitiva → DLQ
  {
    timestamp: '2026-06-09T17:04:00.522Z',
    employeeId: 'T-DEAD',
    flow: 'TERMINATION',
    status: 'ERROR',
    error: SAAS_503,
  },
  {
    timestamp: '2026-06-09T17:04:00.395Z',
    employeeId: 'T-DEAD',
    flow: 'TERMINATION',
    status: 'RETRY',
    error: SAAS_503,
  },
  // Cenário 2 — Volume + rate limit (lote de upserts)
  {
    timestamp: '2026-06-09T17:04:00.305Z',
    employeeId: 'B-13',
    flow: 'UPSERT',
    status: 'SUCCESS',
  },
  {
    timestamp: '2026-06-09T17:04:00.186Z',
    employeeId: 'B-1',
    flow: 'UPSERT',
    status: 'SUCCESS',
  },
  // Cenário 1 — Priorização + retry/backoff
  {
    timestamp: '2026-06-09T17:04:00.170Z',
    employeeId: 'U-1',
    flow: 'UPSERT',
    status: 'SUCCESS',
  },
  {
    timestamp: '2026-06-09T17:04:00.160Z',
    employeeId: 'T-1',
    flow: 'TERMINATION',
    status: 'SUCCESS',
  },
  {
    timestamp: '2026-06-09T17:03:59.984Z',
    employeeId: 'T-1',
    flow: 'TERMINATION',
    status: 'RETRY',
    error: SAAS_503,
  },
  {
    timestamp: '2026-06-09T17:03:59.890Z',
    employeeId: 'T-2',
    flow: 'TERMINATION',
    status: 'SUCCESS',
  },
];
