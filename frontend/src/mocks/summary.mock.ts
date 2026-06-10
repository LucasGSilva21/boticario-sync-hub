import type { SummaryTotals } from '../types/dashboard.types';

// Totais capturados da execução real da demo (backend: npm run start:local →
// runLocalDemo/printSummary). Mantidos fixos: o dashboard é demonstrativo (ARCH §25).
export const summaryMock: SummaryTotals = {
  successes: 42, // SUCCESS
  errors: 8, // ERROR
  retries: 9, // RETRY
  idempotency: 1, // SKIPPED
};
