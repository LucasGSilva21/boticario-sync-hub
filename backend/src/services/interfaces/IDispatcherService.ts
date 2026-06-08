import type { EmployeeEvent } from '../../types/employee.types';

/** Decisão sobre o destino da mensagem após o processamento. */
export type DispatchResult = 'ACK' | 'RETRY';

export interface IDispatcherService {
  /**
   * Processa um evento já desserializado e indica se a mensagem pode ser
   * removida (ACK) ou deve voltar à fila (RETRY).
   */
  process(event: EmployeeEvent): Promise<DispatchResult>;
}
