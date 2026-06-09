import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders the title and its children', () => {
    render(
      <Card title="Métricas">
        <p>conteúdo</p>
      </Card>,
    );
    expect(
      screen.getByRole('heading', { name: 'Métricas' }),
    ).toBeInTheDocument();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});
