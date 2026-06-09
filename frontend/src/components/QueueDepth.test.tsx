import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueueDepth } from './QueueDepth';

describe('QueueDepth', () => {
  it('renders both queues with their depths and priority labels', () => {
    render(<QueueDepth queues={{ termination: 3, upsert: 128 }} />);
    expect(screen.getByText('employee-termination-queue')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Prioritária')).toBeInTheDocument();
    expect(screen.getByText('employee-upsert-queue')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Batch')).toBeInTheDocument();
  });
});
