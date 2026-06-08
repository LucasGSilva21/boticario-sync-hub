import type { EmployeeEvent } from '../../types/employee.types';
import type { AcquireResult } from '../../repositories/interfaces/ISyncStateRepository';

export interface IIdempotencyService {
  tryAcquire(event: EmployeeEvent): Promise<AcquireResult>;
  markCompleted(event: EmployeeEvent): Promise<void>;
  markFailed(event: EmployeeEvent): Promise<void>;
}
