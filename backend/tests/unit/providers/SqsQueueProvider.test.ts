import { SQSClient } from '@aws-sdk/client-sqs';
import { SqsQueueProvider } from '../../../src/providers/SqsQueueProvider';

describe('SqsQueueProvider', () => {
  it('maps received messages, drops incomplete ones, and applies the configured wait time', async () => {
    const sendMock = jest.fn().mockResolvedValue({
      Messages: [
        { Body: 'a', ReceiptHandle: 'rh-a' },
        { Body: 'b' }, // missing ReceiptHandle -> dropped
        { ReceiptHandle: 'rh-c' }, // missing Body -> dropped
      ],
    });
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(15, client);
    const messages = await provider.receiveMessages('queue-url', 10);
    expect(messages).toEqual([{ body: 'a', receiptHandle: 'rh-a' }]);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          QueueUrl: 'queue-url',
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 15,
        },
      }),
    );
  });

  it('returns an empty array when SQS omits Messages', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    expect(await provider.receiveMessages('queue-url', 5)).toEqual([]);
  });

  it('sends a message with the given body', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    await provider.sendMessage('queue-url', 'payload');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { QueueUrl: 'queue-url', MessageBody: 'payload' },
      }),
    );
  });

  it('deletes a message by receipt handle', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    await provider.deleteMessage('queue-url', 'rh-1');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { QueueUrl: 'queue-url', ReceiptHandle: 'rh-1' },
      }),
    );
  });

  it('uses a default SQS client when none is provided', () => {
    expect(() => new SqsQueueProvider(20)).not.toThrow();
  });
});
