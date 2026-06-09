import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';
import type { EventStatus } from '../types/dashboard.types';

describe('StatusBadge', () => {
  it.each<EventStatus>(['SUCCESS', 'ERROR', 'RETRY', 'SKIPPED'])(
    'renders the %s status label',
    (status) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );

  it('applies the semantic color for the SUCCESS status', () => {
    render(<StatusBadge status="SUCCESS" />);
    expect(screen.getByText('SUCCESS')).toHaveClass('text-status-success');
  });
});
