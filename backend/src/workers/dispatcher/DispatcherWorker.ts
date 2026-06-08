import { sleep } from '../../utils/sleep';
import type { EmployeeEvent } from '../../types/employee.types';
import type {
  IQueueMessage,
  IQueueProvider,
} from '../../providers/interfaces/IQueueProvider';
import type { ICircuitBreaker } from '../../utils/interfaces/ICircuitBreaker';
import type { ILogger } from '../../utils/interfaces/ILogger';
import type {
  DispatchResult,
  IDispatcherService,
} from '../../services/interfaces/IDispatcherService';

const IDLE_POLL_MS = 5_000;
const MAX_MESSAGES = 10;

export interface DispatcherWorkerConfig {
  terminationQueueUrl: string;
  upsertQueueUrl: string;
  circuitBreakerResetMs: number;
}

export class DispatcherWorker {
  private running = false;

  constructor(
    private readonly dispatcher: IDispatcherService,
    private readonly queue: IQueueProvider,
    private readonly circuitBreaker: ICircuitBreaker,
    private readonly config: DispatcherWorkerConfig,
    private readonly logger: ILogger,
    private readonly sleepFn: (ms: number) => Promise<void> = sleep,
  ) {}

  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      await this.runOnce();
    }
  }

  stop(): void {
    this.running = false;
  }

  /** Um ciclo do loop: avalia o circuito e faz polling priorizado. */
  async runOnce(): Promise<void> {
    if (this.circuitBreaker.isOpen()) {
      await this.sleepFn(this.config.circuitBreakerResetMs);
      return;
    }

    const terminations = await this.queue.receiveMessages(
      this.config.terminationQueueUrl,
      MAX_MESSAGES,
    );
    if (terminations.length > 0) {
      await this.processBatch(this.config.terminationQueueUrl, terminations);
      return;
    }

    const upserts = await this.queue.receiveMessages(
      this.config.upsertQueueUrl,
      MAX_MESSAGES,
    );
    if (upserts.length > 0) {
      await this.processBatch(this.config.upsertQueueUrl, upserts);
      return;
    }

    await this.sleepFn(IDLE_POLL_MS);
  }

  private async processBatch(
    queueUrl: string,
    messages: IQueueMessage[],
  ): Promise<void> {
    for (const message of messages) {
      const result = await this.handleMessage(message);
      if (result === 'ACK') {
        await this.queue.deleteMessage(queueUrl, message.receiptHandle);
      }
      // RETRY → não deleta; volta à fila pelo Visibility Timeout.
    }
  }

  private async handleMessage(message: IQueueMessage): Promise<DispatchResult> {
    let event: EmployeeEvent;
    try {
      event = JSON.parse(message.body) as EmployeeEvent;
    } catch {
      // Corpo irrecuperável: RETRY → após maxReceiveCount vai para a DLQ.
      this.logger.error({ status: 'ERROR', error: 'Invalid message body' });
      return 'RETRY';
    }
    return this.dispatcher.process(event);
  }
}
