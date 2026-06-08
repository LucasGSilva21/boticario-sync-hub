import { CircuitOpenError } from '../errors/CircuitOpenError';
import type { EmployeeEvent } from '../types/employee.types';
import type { ISaaSClient } from '../providers/interfaces/ISaaSClient';
import type { ILogger } from '../utils/interfaces/ILogger';
import type { IIdempotencyService } from './interfaces/IIdempotencyService';
import type {
  DispatchResult,
  IDispatcherService,
} from './interfaces/IDispatcherService';

export class DispatcherService implements IDispatcherService {
  constructor(
    private readonly idempotency: IIdempotencyService,
    private readonly saasClient: ISaaSClient,
    private readonly logger: ILogger,
  ) {}

  async process(event: EmployeeEvent): Promise<DispatchResult> {
    const acquired = await this.idempotency.tryAcquire(event);

    if (!acquired.acquired) {
      // COMPLETED → já enviado, descarta. LOCK_ACTIVE → outro consumidor detém o lock.
      return acquired.reason === 'ALREADY_COMPLETED' ? 'ACK' : 'RETRY';
    }

    try {
      await this.saasClient.sendEvent(event);
      await this.idempotency.markCompleted(event);
      this.logger.info({
        employeeId: event.employeeId,
        flow: event.eventType,
        status: 'SUCCESS',
      });
      return 'ACK';
    } catch (error) {
      // Circuito aberto: não marca FAILED — devolve à fila sem queimar tentativa.
      if (error instanceof CircuitOpenError) {
        return 'RETRY';
      }
      await this.idempotency.markFailed(event);
      this.logger.error({
        employeeId: event.employeeId,
        flow: event.eventType,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      return 'RETRY';
    }
  }
}
