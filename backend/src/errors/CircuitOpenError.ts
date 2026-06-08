/** Circuito aberto: a chamada é bloqueada sem rede e não deve ser retentada. */
export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}
