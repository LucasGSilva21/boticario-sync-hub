import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type {
  IQueueMessage,
  IQueueProvider,
} from './interfaces/IQueueProvider';

// Limite nativo do SQS: no máximo 10 entradas por SendMessageBatch.
const SQS_MAX_BATCH_SIZE = 10;

export class SqsQueueProvider implements IQueueProvider {
  constructor(
    private readonly waitTimeSeconds: number,
    private readonly client: SQSClient = new SQSClient({}),
  ) {}

  async receiveMessages(
    queueUrl: string,
    maxMessages: number,
  ): Promise<IQueueMessage[]> {
    const { Messages } = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: this.waitTimeSeconds, // long polling configurável (SQS_WAIT_TIME_SECONDS)
      }),
    );

    return (Messages ?? []).flatMap((message) =>
      message.Body !== undefined && message.ReceiptHandle !== undefined
        ? [{ body: message.Body, receiptHandle: message.ReceiptHandle }]
        : [],
    );
  }

  async sendMessage(queueUrl: string, body: string): Promise<void> {
    await this.client.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
    );
  }

  async sendMessageBatch(queueUrl: string, bodies: string[]): Promise<void> {
    for (let i = 0; i < bodies.length; i += SQS_MAX_BATCH_SIZE) {
      const chunk = bodies.slice(i, i + SQS_MAX_BATCH_SIZE);
      const { Failed } = await this.client.send(
        new SendMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: chunk.map((body, index) => ({
            Id: String(index),
            MessageBody: body,
          })),
        }),
      );
      // SendMessageBatch é PARCIAL: entradas com erro voltam em `Failed` sem
      // lançar. Tratamos como falha do objeto inteiro -> a ingestão vai à
      // ingestion-dlq (destino on-failure) e é reprocessada.
      if (Failed !== undefined && Failed.length > 0) {
        throw new Error(
          `SendMessageBatch falhou em ${Failed.length} de ${chunk.length} mensagens`,
        );
      }
    }
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
