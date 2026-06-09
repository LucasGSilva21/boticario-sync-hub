import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCards } from './SummaryCards';
import type { SummaryTotals } from '../types/dashboard.types';

const summary: SummaryTotals = {
  successes: 42,
  errors: 9,
  retries: 8,
  idempotency: 1,
};

describe('SummaryCards', () => {
  it('renders the four consolidated totals with their labels', () => {
    render(<SummaryCards summary={summary} />);
    expect(screen.getByText('Sucessos')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Erros')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Retentativas')).toBeInTheDocument();
    expect(screen.getByText('Idempotência')).toBeInTheDocument();
  });
});
