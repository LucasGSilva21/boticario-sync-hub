import { useMemo } from 'react';
import type { DashboardData } from '../types/dashboard.types';
import { summaryMock } from '../mocks/summary.mock';
import { metricsMock } from '../mocks/metrics.mock';
import { eventsMock } from '../mocks/events.mock';
import { queuesMock } from '../mocks/queues.mock';
import { circuitBreakerMock } from '../mocks/circuitBreaker.mock';

/** Agrega os mocks num snapshot único do dashboard (sem rede — ARCH §25). */
export function useDashboardData(): DashboardData {
  return useMemo(
    () => ({
      summary: summaryMock,
      metrics: metricsMock,
      circuitBreaker: circuitBreakerMock,
      queues: queuesMock,
      events: eventsMock,
    }),
    [],
  );
}
