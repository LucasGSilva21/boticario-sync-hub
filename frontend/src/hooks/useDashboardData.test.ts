import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDashboardData } from './useDashboardData';

describe('useDashboardData', () => {
  it('exposes the consolidated dashboard snapshot', () => {
    const { result } = renderHook(() => useDashboardData());
    expect(result.current.summary.successes).toBe(42);
    expect(result.current.metrics.saas_requests_total).toBe(59);
    expect(result.current.circuitBreaker).toBe('CLOSED');
    expect(result.current.queues.upsert).toBe(128);
    expect(result.current.events).toHaveLength(14);
  });

  it('returns a stable reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useDashboardData());
    const firstSnapshot = result.current;
    rerender();
    expect(result.current).toBe(firstSnapshot);
  });
});
