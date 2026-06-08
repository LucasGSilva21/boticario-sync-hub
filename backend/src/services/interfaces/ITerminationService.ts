export interface ITerminationService {
  terminate(employeeId: string): Promise<void>;
}
