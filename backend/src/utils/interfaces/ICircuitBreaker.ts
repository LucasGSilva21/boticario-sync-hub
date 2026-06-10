export interface ICircuitBreaker {
  /** Peek (não consome): true enquanto OPEN no cooldown. Usado para pausar o
   *  polling do worker e como guarda barata antes de adquirir o lock. */
  isOpen(): boolean;
  /** Gate consumível por tentativa: decide se ESTA chamada pode ir ao SaaS.
   *  No estado HALF_OPEN admite exatamente uma sonda (single-trial) — as demais
   *  recebem `false`, evitando rajada concorrente contra um parceiro instável. */
  tryProceed(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}
