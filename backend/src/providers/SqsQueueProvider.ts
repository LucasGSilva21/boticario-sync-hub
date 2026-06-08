import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type {
  IQueueMessage,
  IQueueProvider,
} from './interfaces/IQueueProvider';

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

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
