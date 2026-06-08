import type { FlowType } from '../../types/employee.types';

export type AcquireResult =
  | { acquired: true }
  | { acquired: false; reason: 'ALREADY_COMPLETED' | 'LOCK_ACTIVE' };

export interface ISyncStateRepository {
  tryAcquireProcessing(
    employeeId: string,
    eventHash: string,
    flow: FlowType,
    lockExpiresAt: Date,
  ): Promise<AcquireResult>;
  markCompleted(employeeId: string, eventHash: string): Promise<void>;
  markFailed(employeeId: string, eventHash: string): Promise<void>;
}
