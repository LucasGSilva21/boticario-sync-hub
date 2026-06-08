import type { TerminationEvent } from '../types/employee.types';
import type { IQueueProvider } from '../providers/interfaces/IQueueProvider';
import type { ITerminationService } from './interfaces/ITerminationService';

export class TerminationService implements ITerminationService {
  constructor(
    private readonly queue: IQueueProvider,
    private readonly terminationQueueUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async terminate(employeeId: string): Promise<void> {
    const event: TerminationEvent = {
      employeeId,
      eventType: 'TERMINATION',
      eventTimestamp: this.now().toISOString(),
    };
    await this.queue.sendMessage(
      this.terminationQueueUrl,
      JSON.stringify(event),
    );
  }
}
