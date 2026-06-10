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

  it('sends a batch in a single call when within the 10-message limit', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    await provider.sendMessageBatch('queue-url', ['a', 'b', 'c']);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          QueueUrl: 'queue-url',
          Entries: [
            { Id: '0', MessageBody: 'a' },
            { Id: '1', MessageBody: 'b' },
            { Id: '2', MessageBody: 'c' },
          ],
        },
      }),
    );
  });

  it('splits a batch larger than 10 into multiple chunked calls', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    const bodies = Array.from({ length: 23 }, (_, i) => `m${i}`);
    await provider.sendMessageBatch('queue-url', bodies);
    expect(sendMock).toHaveBeenCalledTimes(3); // 10 + 10 + 3
    const calls = sendMock.mock.calls as Array<
      [{ input: { Entries: unknown[] } }]
    >;
    expect(calls[2]?.[0]?.input.Entries).toHaveLength(3);
  });

  it('does not call SQS for an empty batch', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    await provider.sendMessageBatch('queue-url', []);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws when the batch reports partial failures', async () => {
    const sendMock = jest
      .fn()
      .mockResolvedValue({ Failed: [{ Id: '1', Code: 'X' }] });
    const client = { send: sendMock } as unknown as SQSClient;
    const provider = new SqsQueueProvider(20, client);
    await expect(
      provider.sendMessageBatch('queue-url', ['a', 'b']),
    ).rejects.toThrow('SendMessageBatch falhou em 1 de 2 mensagens');
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
