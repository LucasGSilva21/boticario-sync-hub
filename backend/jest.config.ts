import type { Config } from 'jest';

const config: Config = {
  // Ambiente Node (sem DOM) — Lambdas e worker ECS rodam em Node puro
  testEnvironment: 'node',

  // Todos os testes vivem em /tests, espelhando a estrutura de /src
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],

  // Transpila TS via ts-jest usando o tsconfig do projeto (nodenext → CommonJS).
  // Forma explícita (não-deprecada) recomendada pelo ts-jest 29.
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tests/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Higiene de mocks entre testes (determinismo — exigência do guia)
  clearMocks: true,
  restoreMocks: true,

  // Cobertura medida sobre o código de negócio em /src
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types/**', // apenas assinaturas de tipo, sem runtime
    '!src/config/**', // leitura/validação de env
    '!src/functions/**', // entrypoints finos (sem lógica, por contrato)
    '!src/workers/**/main.ts', // entrypoint fino do worker (sem lógica)
    '!src/factories/**', // composition root (DI); coberto por testes de integração
  ],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  coverageReporters: ['text', 'text-summary', 'lcov'],

  // Meta de cobertura: 100% em todo o código de negócio
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

export default config;
