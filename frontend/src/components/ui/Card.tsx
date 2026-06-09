import type { ReactNode } from 'react';

type CardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

// Painel branco com título — base visual dos blocos do dashboard.
export function Card({
  title,
  children,
  className = '',
}: CardProps): React.JSX.Element {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h2 className="mb-4 text-sm font-medium text-slate-500">{title}</h2>
      {children}
    </section>
  );
}
