import type { FlowType } from '../../types/employee.types';
import type { ProcessingStatus } from '../../types/sync-state.types';
import type {
  AcquireResult,
  ISyncStateRepository,
} from '../interfaces/ISyncStateRepository';

interface StateRecord {
  status: ProcessingStatus;
  lockExpiresAt: number; // epoch ms
}

/** Estado de sincronização em memória (demo): simula o Zero-Read do DynamoDB. */
export class InMemorySyncStateRepository implements ISyncStateRepository {
  private readonly store = new Map<string, StateRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  tryAcquireProcessing(
    employeeId: string,
    eventHash: string,
    flow: FlowType,
    lockExpiresAt: Date,
  ): Promise<AcquireResult> {
    void flow; // mantido por fidelidade ao contrato; não influencia a aquisição
    const key = `${employeeId}#${eventHash}`;
    const existing = this.store.get(key);

    if (existing !== undefined) {
      if (existing.status === 'COMPLETED') {
        return Promise.resolve({
          acquired: false,
          reason: 'ALREADY_COMPLETED',
        });
      }
      if (
        existing.status === 'PROCESSING' &&
        this.now() < existing.lockExpiresAt
      ) {
        return Promise.resolve({ acquired: false, reason: 'LOCK_ACTIVE' });
      }
    }

    this.store.set(key, {
      status: 'PROCESSING',
      lockExpiresAt: lockExpiresAt.getTime(),
    });
    return Promise.resolve({ acquired: true });
  }

  markCompleted(employeeId: string, eventHash: string): Promise<void> {
    return this.setStatus(employeeId, eventHash, 'COMPLETED');
  }

  markFailed(employeeId: string, eventHash: string): Promise<void> {
    return this.setStatus(employeeId, eventHash, 'FAILED');
  }

  private setStatus(
    employeeId: string,
    eventHash: string,
    status: ProcessingStatus,
  ): Promise<void> {
    const record = this.store.get(`${employeeId}#${eventHash}`);
    if (record !== undefined) {
      record.status = status;
    }
    return Promise.resolve();
  }
}
