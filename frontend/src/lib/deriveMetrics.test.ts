import { describe, expect, it } from 'vitest';
import { toMetricRows, totalQueueDepth } from './deriveMetrics';
import type { OperationalMetrics } from '../types/dashboard.types';

const metrics: OperationalMetrics = {
  saas_requests_total: 59,
  saas_requests_success: 42,
  saas_requests_failed: 17,
  employees_processed_total: 52,
  idempotency_rejections_total: 1,
  circuit_breaker_open_total: 1,
};

describe('toMetricRows', () => {
  it('returns one row per operational metric', () => {
    expect(toMetricRows(metrics)).toHaveLength(6);
  });

  it('preserves the canonical metric order', () => {
    expect(toMetricRows(metrics).map((row) => row.key)).toEqual([
      'saas_requests_total',
      'saas_requests_success',
      'saas_requests_failed',
      'employees_processed_total',
      'idempotency_rejections_total',
      'circuit_breaker_open_total',
    ]);
  });

  it('maps each metric to its label and value', () => {
    const rows = toMetricRows(metrics);
    expect(rows[0]).toEqual({
      key: 'saas_requests_total',
      label: 'Requisições ao SaaS',
      value: 59,
    });
  });
});

describe('totalQueueDepth', () => {
  it('sums the termination and upsert depths', () => {
    expect(totalQueueDepth({ termination: 3, upsert: 128 })).toBe(131);
  });
});
