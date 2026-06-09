import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Desmonta a árvore React após cada teste (isolamento entre casos).
afterEach((): void => {
  cleanup();
});
