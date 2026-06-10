import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the dashboard header', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Boticário Sync Hub' }),
    ).toBeInTheDocument();
  });

  it('composes every dashboard section', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Circuit Breaker' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Mensagens nas filas' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Métricas operacionais' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Eventos recentes' }),
    ).toBeInTheDocument();
  });

  it('wires the mocked data into the sections', () => {
    render(<App />);
    expect(screen.getByText('Sucessos')).toBeInTheDocument();
    expect(screen.getByText('employee-termination-queue')).toBeInTheDocument();
    expect(screen.getByText('B-13')).toBeInTheDocument();
  });
});
