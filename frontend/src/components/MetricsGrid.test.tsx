import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricsGrid } from './MetricsGrid';
import type { OperationalMetrics } from '../types/dashboard.types';

const metrics: OperationalMetrics = {
  saas_requests_total: 59,
  saas_requests_success: 42,
  saas_requests_failed: 17,
  employees_processed_total: 52,
  idempotency_rejections_total: 1,
  circuit_breaker_open_total: 1,
};

describe('MetricsGrid', () => {
  it('renders the section title', () => {
    render(<MetricsGrid metrics={metrics} />);
    expect(
      screen.getByRole('heading', { name: 'Métricas operacionais' }),
    ).toBeInTheDocument();
  });

  it('shows each metric label, value and canonical name', () => {
    render(<MetricsGrid metrics={metrics} />);
    expect(screen.getByText('Requisições ao SaaS')).toBeInTheDocument();
    expect(screen.getByText('59')).toBeInTheDocument();
    expect(screen.getByText('saas_requests_total')).toBeInTheDocument();
    expect(screen.getByText('employees_processed_total')).toBeInTheDocument();
  });
});
