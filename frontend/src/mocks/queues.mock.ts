import type { QueueDepths } from '../types/dashboard.types';

// Snapshot demonstrativo da profundidade das filas (ARCH §8).
// A fila prioritária (termination) é drenada primeiro → baixa; a fila batch
// (upsert, ~30k/dia) acumula backlog → maior. Instantâneo, não derivado da demo.
export const queuesMock: QueueDepths = {
  termination: 3, // fila prioritária (near real-time)
  upsert: 128, // fila batch (backlog)
};
