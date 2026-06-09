import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventsTable } from './EventsTable';
import type { LogEvent } from '../types/dashboard.types';

const skippedEvent: LogEvent = {
  timestamp: '2026-06-09T17:04:01.642Z',
  employeeId: 'U-DUP',
  flow: 'UPSERT',
  status: 'SKIPPED',
};

const errorEvent: LogEvent = {
  timestamp: '2026-06-09T17:04:00.522Z',
  employeeId: 'T-DEAD',
  flow: 'TERMINATION',
  status: 'ERROR',
  error: 'SaaS request failed with status 503',
};

describe('EventsTable', () => {
  it('renders a row per event with time, employee, flow, status and error', () => {
    render(<EventsTable events={[skippedEvent, errorEvent]} />);
    expect(
      screen.getByRole('heading', { name: 'Eventos recentes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('U-DUP')).toBeInTheDocument();
    expect(screen.getByText('T-DEAD')).toBeInTheDocument();
    expect(screen.getByText('17:04:01')).toBeInTheDocument();
    expect(screen.getByText('SKIPPED')).toBeInTheDocument();
    expect(
      screen.getByText('SaaS request failed with status 503'),
    ).toBeInTheDocument();
  });

  it('shows a dash when an event has no error', () => {
    render(<EventsTable events={[skippedEvent]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
