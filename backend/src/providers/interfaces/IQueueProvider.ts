export interface IQueueMessage {
  body: string;
  receiptHandle: string;
}

export interface IQueueProvider {
  receiveMessages(
    queueUrl: string,
    maxMessages: number,
  ): Promise<IQueueMessage[]>;
  sendMessage(queueUrl: string, body: string): Promise<void>;
  sendMessageBatch(queueUrl: string, bodies: string[]): Promise<void>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}
