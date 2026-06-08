import type { EmployeeEvent } from '../../types/employee.types';

export interface ISaaSClient {
  sendEvent(event: EmployeeEvent): Promise<void>;
}
