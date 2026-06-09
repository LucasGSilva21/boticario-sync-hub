/**
 * Relógio mutável para a demo: injetado no CircuitBreaker (`now`) e avançado
 * pelo `sleepFn` do worker, tornando as transições do circuito (Open →
 * Half-Open) determinísticas e instantâneas, sem esperas reais.
 */
export class ManualClock {
  constructor(private current: number = Date.now()) {}

  now = (): number => this.current;

  advance(ms: number): void {
    this.current += ms;
  }
}
