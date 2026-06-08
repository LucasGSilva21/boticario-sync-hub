export interface ICircuitBreaker {
  isOpen(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}
