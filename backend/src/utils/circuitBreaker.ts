import type { ICircuitBreaker } from './interfaces/ICircuitBreaker';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker implements ICircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private openedAt = 0;

  constructor(
    private readonly resetTimeoutSeconds: number,
    private readonly failureThreshold: number,
    private readonly now: () => number = Date.now,
    // Notificação de transição → OPEN. Mantém o util desacoplado de métricas:
    // o factory liga isto à emissão de `circuit_breaker_open_total` (§20).
    private readonly onOpen?: () => void,
  ) {}

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      const elapsedMs = this.now() - this.openedAt;
      if (elapsedMs >= this.resetTimeoutSeconds * 1000) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
  }

  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.open();
      return;
    }
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.state = 'OPEN';
    this.openedAt = this.now();
    this.failureCount = 0;
    this.onOpen?.();
  }
}
