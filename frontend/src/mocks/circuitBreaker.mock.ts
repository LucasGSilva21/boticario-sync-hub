import type { CircuitBreakerState } from '../types/dashboard.types';

// Estado atual do Circuit Breaker (ARCH §15). Após o cenário 4 (abre → half-open
// → closed), o estado saudável corrente é CLOSED; o total de aberturas passadas
// fica registrado em metrics.circuit_breaker_open_total.
export const circuitBreakerMock: CircuitBreakerState = 'CLOSED';
