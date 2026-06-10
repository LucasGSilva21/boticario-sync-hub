import { randomUUID } from 'node:crypto';
import type {
  IQueueMessage,
  IQueueProvider,
} from '../interfaces/IQueueProvider';

interface StoredMessage {
  body: string;
  receiptHandle: string;
}

/** Fila em memória (demo): simula o SQS sem rede. */
export class InMemoryQueueProvider implements IQueueProvider {
  private readonly queues = new Map<string, StoredMessage[]>();

  /** Pré-carrega uma fila com corpos de mensagem (para a demo). */
  seed(queueUrl: string, bodies: string[]): void {
    const incoming = bodies.map((body) => ({
      body,
      receiptHandle: randomUUID(),
    }));
    const current = this.queues.get(queueUrl) ?? [];
    this.queues.set(queueUrl, [...current, ...incoming]);
  }

  receiveMessages(
    queueUrl: string,
    maxMessages: number,
  ): Promise<IQueueMessage[]> {
    const queue = this.queues.get(queueUrl) ?? [];
    return Promise.resolve(
      queue.slice(0, maxMessages).map((m) => ({
        body: m.body,
        receiptHandle: m.receiptHandle,
      })),
    );
  }

  sendMessage(queueUrl: string, body: string): Promise<void> {
    const queue = this.queues.get(queueUrl) ?? [];
    queue.push({ body, receiptHandle: randomUUID() });
    this.queues.set(queueUrl, queue);
    return Promise.resolve();
  }

  sendMessageBatch(queueUrl: string, bodies: string[]): Promise<void> {
    const queue = this.queues.get(queueUrl) ?? [];
    for (const body of bodies) {
      queue.push({ body, receiptHandle: randomUUID() });
    }
    this.queues.set(queueUrl, queue);
    return Promise.resolve();
  }

  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    const queue = this.queues.get(queueUrl) ?? [];
    this.queues.set(
      queueUrl,
      queue.filter((m) => m.receiptHandle !== receiptHandle),
    );
    return Promise.resolve();
  }

  /** Total de mensagens pendentes (a demo usa para saber quando drenou). */
  size(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }
}
