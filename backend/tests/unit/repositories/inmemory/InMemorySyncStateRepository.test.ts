import { InMemorySyncStateRepository } from '../../../../src/repositories/inmemory/InMemorySyncStateRepository';

const FIXED = 1000;
const lockAt = (offset: number): Date => new Date(FIXED + offset);

describe('InMemorySyncStateRepository', () => {
  it('acquires a brand-new event', async () => {
    const repo = new InMemorySyncStateRepository(() => FIXED);

    await expect(
      repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000)),
    ).resolves.toEqual({ acquired: true });
  });

  it('rejects ALREADY_COMPLETED once marked completed', async () => {
    const repo = new InMemorySyncStateRepository(() => FIXED);
    await repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000));
    await repo.markCompleted('1', 'h');

    await expect(
      repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000)),
    ).resolves.toEqual({ acquired: false, reason: 'ALREADY_COMPLETED' });
  });

  it('rejects LOCK_ACTIVE while the lock is still valid', async () => {
    const repo = new InMemorySyncStateRepository(() => FIXED);
    await repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000));

    await expect(
      repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000)),
    ).resolves.toEqual({ acquired: false, reason: 'LOCK_ACTIVE' });
  });

  it('recovers a FAILED event', async () => {
    const repo = new InMemorySyncStateRepository(() => FIXED);
    await repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000));
    await repo.markFailed('1', 'h');

    await expect(
      repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(1000)),
    ).resolves.toEqual({ acquired: true });
  });

  it('recovers an orphaned PROCESSING event after the lock expires', async () => {
    let current = FIXED;
    const repo = new InMemorySyncStateRepository(() => current);
    await repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockAt(100));

    current = FIXED + 200; // past the lock

    await expect(
      repo.tryAcquireProcessing('1', 'h', 'UPSERT', new Date(current + 100)),
    ).resolves.toEqual({ acquired: true });
  });

  it('ignores marking an event that was never acquired', async () => {
    const repo = new InMemorySyncStateRepository(() => FIXED);
    await repo.markCompleted('x', 'y');

    await expect(
      repo.tryAcquireProcessing('x', 'y', 'UPSERT', lockAt(1000)),
    ).resolves.toEqual({ acquired: true });
  });
});
