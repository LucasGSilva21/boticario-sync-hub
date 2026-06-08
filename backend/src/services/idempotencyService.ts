import { generateHash } from '../utils/hashGenerator';
import type { EmployeeEvent } from '../types/employee.types';
import type {
  AcquireResult,
  ISyncStateRepository,
} from '../repositories/interfaces/ISyncStateRepository';
import type { IIdempotencyService } from './interfaces/IIdempotencyService';

export class IdempotencyService implements IIdempotencyService {
  constructor(
    private readonly repository: ISyncStateRepository,
    private readonly lockTimeoutSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async tryAcquire(event: EmployeeEvent): Promise<AcquireResult> {
    const lockExpiresAt = new Date(
      this.now().getTime() + this.lockTimeoutSeconds * 1000,
    );
    return this.repository.tryAcquireProcessing(
      event.employeeId,
      generateHash(event),
      event.eventType,
      lockExpiresAt,
    );
  }

  async markCompleted(event: EmployeeEvent): Promise<void> {
    await this.repository.markCompleted(event.employeeId, generateHash(event));
  }

  async markFailed(event: EmployeeEvent): Promise<void> {
    await this.repository.markFailed(event.employeeId, generateHash(event));
  }
}
