import { InMemoryQueueProvider } from '../../../../src/providers/inmemory/InMemoryQueueProvider';

describe('InMemoryQueueProvider', () => {
  it('seeds a queue, appends on a second seed, and reports its size', () => {
    const provider = new InMemoryQueueProvider();
    provider.seed('q', ['a', 'b']);
    provider.seed('q', ['c']);

    expect(provider.size()).toBe(3);
  });

  it('receives up to maxMessages with receipt handles', async () => {
    const provider = new InMemoryQueueProvider();
    provider.seed('q', ['a', 'b', 'c']);

    const received = await provider.receiveMessages('q', 2);

    expect(received).toHaveLength(2);
    expect(received[0]?.body).toBe('a');
    expect(typeof received[0]?.receiptHandle).toBe('string');
  });

  it('returns an empty array for an unknown queue', async () => {
    const provider = new InMemoryQueueProvider();
    expect(await provider.receiveMessages('missing', 10)).toEqual([]);
  });

  it('sends a message that becomes receivable', async () => {
    const provider = new InMemoryQueueProvider();
    await provider.sendMessage('q', 'hello');

    const received = await provider.receiveMessages('q', 10);

    expect(received).toHaveLength(1);
    expect(received[0]?.body).toBe('hello');
  });

  it('deletes a message by receipt handle', async () => {
    const provider = new InMemoryQueueProvider();
    provider.seed('q', ['a']);
    const [message] = await provider.receiveMessages('q', 10);

    await provider.deleteMessage('q', message?.receiptHandle ?? '');

    expect(provider.size()).toBe(0);
  });

  it('ignores deletion on an unknown queue', async () => {
    const provider = new InMemoryQueueProvider();
    await provider.deleteMessage('missing', 'whatever');
    expect(provider.size()).toBe(0);
  });
});
