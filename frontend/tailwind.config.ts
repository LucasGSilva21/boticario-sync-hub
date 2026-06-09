import type { Config } from 'tailwindcss';

// Tokens semânticos alinhados ao domínio (ARCH §15 Circuit Breaker, §19 status de log).
const config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Status de evento (log estruturado §19)
        status: {
          success: '#16a34a', // SUCCESS
          error: '#dc2626', // ERROR
          retry: '#d97706', // RETRY
          skipped: '#64748b', // SKIPPED (idempotência)
        },
        // Estados do Circuit Breaker (§15)
        circuit: {
          closed: '#16a34a', // operação normal
          open: '#dc2626', // polling suspenso
          halfOpen: '#d97706', // tentativa de recuperação
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
