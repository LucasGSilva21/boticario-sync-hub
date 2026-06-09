/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dashboard demonstrativo: sem proxy/rede — dados 100% mockados (ARCH §25).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scaffolding/dados sem lógica testável ficam fora da cobertura.
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/mocks/**',
        'src/types/**',
        '**/*.config.*',
        '**/*.d.ts',
      ],
      // Decisão 3: lógica pura a 100%; meta global ~90%.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        'src/lib/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'src/hooks/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
