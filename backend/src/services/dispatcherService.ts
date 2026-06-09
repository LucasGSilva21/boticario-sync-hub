import { CircuitOpenError } from '../errors/CircuitOpenError';
import type { EmployeeEvent } from '../types/employee.types';
import type { ISaaSClient } from '../providers/interfaces/ISaaSClient';
import type { ICircuitBreaker } from '../utils/interfaces/ICircuitBreaker';
import type { ILogger } from '../utils/interfaces/ILogger';
import type { IMetrics } from '../utils/interfaces/IMetrics';
import type { IIdempotencyService } from './interfaces/IIdempotencyService';
import type {
  DispatchResult,
  IDispatcherService,
} from './interfaces/IDispatcherService';

export class DispatcherService implements IDispatcherService {
  constructor(
    private readonly idempotency: IIdempotencyService,
    private readonly saasClient: ISaaSClient,
    private readonly circuitBreaker: ICircuitBreaker,
    private readonly logger: ILogger,
    private readonly metrics: IMetrics,
  ) {}

  async process(event: EmployeeEvent): Promise<DispatchResult> {
    // Circuito aberto: devolve à fila ANTES de adquirir o lock. Sem chamada de
    // rede, evita criar um registro PROCESSING espúrio (preso por até
    // PROCESSING_LOCK_TIMEOUT_SECONDS) para um evento que nem chegaria ao SaaS.
    if (this.circuitBreaker.isOpen()) {
      return 'RETRY';
    }

    const acquired = await this.idempotency.tryAcquire(event);

    if (!acquired.acquired) {
      // COMPLETED → já enviado, descarta. LOCK_ACTIVE → outro consumidor detém o lock.
      if (acquired.reason === 'ALREADY_COMPLETED') {
        this.metrics.count('idempotency_rejections_total');
      }
      this.logger.info({
        employeeId: event.employeeId,
        flow: event.eventType,
        status: 'SKIPPED',
        reason: acquired.reason,
      });
      return acquired.reason === 'ALREADY_COMPLETED' ? 'ACK' : 'RETRY';
    }

    try {
      await this.saasClient.sendEvent(event);
      await this.idempotency.markCompleted(event);
      this.metrics.count('employees_processed_total');
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
