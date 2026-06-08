import { IdempotencyService } from '../../../src/services/idempotencyService';
import { generateHash } from '../../../src/utils/hashGenerator';
import type {
  EmployeeEvent,
  FlowType,
} from '../../../src/types/employee.types';
import type { AcquireResult } from '../../../src/repositories/interfaces/ISyncStateRepository';

type MockedRepo = {
  tryAcquireProcessing: jest.Mock<
    Promise<AcquireResult>,
    [string, string, FlowType, Date]
  >;
  markCompleted: jest.Mock<Promise<void>, [string, string]>;
  markFailed: jest.Mock<Promise<void>, [string, string]>;
};

function makeRepo(): MockedRepo {
  return {
    tryAcquireProcessing: jest.fn<
      Promise<AcquireResult>,
      [string, string, FlowType, Date]
    >(),
    markCompleted: jest.fn<Promise<void>, [string, string]>(),
    markFailed: jest.fn<Promise<void>, [string, string]>(),
  };
}

const event: EmployeeEvent = {
  employeeId: '1',
  eventType: 'UPSERT',
  eventTimestamp: '2026-01-01T00:00:00Z',
  data: { name: 'Ana', department: 'Tech', position: 'Dev' },
};
const hash = generateHash(event);
const fixedNow = new Date('2026-06-08T12:00:00.000Z');

describe('IdempotencyService', () => {
  it('acquires using the event hash, flow, and a lock expiry from the clock', async () => {
    const repo = makeRepo();
    repo.tryAcquireProcessing.mockResolvedValue({ acquired: true });
    const service = new IdempotencyService(repo, 240, () => fixedNow);
    const result = await service.tryAcquire(event);
    expect(result).toEqual({ acquired: true });
    expect(repo.tryAcquireProcessing).toHaveBeenCalledWith(
      '1',
      hash,
      'UPSERT',
      new Date('2026-06-08T12:04:00.000Z'),
    );
  });

  it('returns the repository rejection result unchanged', async () => {
    const repo = makeRepo();
    repo.tryAcquireProcessing.mockResolvedValue({
      acquired: false,
      reason: 'ALREADY_COMPLETED',
    });
    const service = new IdempotencyService(repo, 240, () => fixedNow);
    await expect(service.tryAcquire(event)).resolves.toEqual({
      acquired: false,
      reason: 'ALREADY_COMPLETED',
    });
  });

  it('marks completed using the event hash', async () => {
    const repo = makeRepo();
    const service = new IdempotencyService(repo, 240, () => fixedNow);
    await service.markCompleted(event);
    expect(repo.markCompleted).toHaveBeenCalledWith('1', hash);
  });

  it('marks failed using the event hash', async () => {
    const repo = makeRepo();
    const service = new IdempotencyService(repo, 240, () => fixedNow);
    await service.markFailed(event);
    expect(repo.markFailed).toHaveBeenCalledWith('1', hash);
  });

  it('uses the default clock when none is injected', async () => {
    const repo = makeRepo();
    repo.tryAcquireProcessing.mockResolvedValue({ acquired: true });
    const service = new IdempotencyService(repo, 240);
    await service.tryAcquire(event);
    expect(repo.tryAcquireProcessing).toHaveBeenCalledTimes(1);
  });
});
