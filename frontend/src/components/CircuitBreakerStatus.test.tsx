import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CircuitBreakerStatus } from './CircuitBreakerStatus';
import type { CircuitBreakerState } from '../types/dashboard.types';

describe('CircuitBreakerStatus', () => {
  it.each<[CircuitBreakerState, string]>([
    ['CLOSED', 'Closed'],
    ['OPEN', 'Open'],
    ['HALF_OPEN', 'Half-Open'],
  ])('renders the %s state label', (state, label) => {
    render(<CircuitBreakerStatus state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('describes the closed state as normal operation', () => {
    render(<CircuitBreakerStatus state="CLOSED" />);
    expect(
      screen.getByText('Operação normal — consumindo as filas.'),
    ).toBeInTheDocument();
  });
});
