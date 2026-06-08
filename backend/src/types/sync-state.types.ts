import type { FlowType } from './employee.types';

export type ProcessingStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type SyncState = {
  employeeId: string;
  eventHash: string;
  flow: FlowType;
  status: ProcessingStatus;
  lockExpiresAt: string;
  createdAt: string;
  updatedAt: string;
};
