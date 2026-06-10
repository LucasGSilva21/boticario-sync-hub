import {
  DispatcherWorker,
  type DispatcherWorkerConfig,
} from '../../../src/workers/dispatcher/DispatcherWorker';
import type { EmployeeEvent } from '../../../src/types/employee.types';
import type { IQueueMessage } from '../../../src/providers/interfaces/IQueueProvider';
import type { DispatchResult } from '../../../src/services/interfaces/IDispatcherService';

const config: DispatcherWorkerConfig = {
  terminationQueueUrl: 'term-url',
  upsertQueueUrl: 'upsert-url',
  circuitBreakerResetMs: 30_000,
};

const termEvent: EmployeeEvent = {
  employeeId: '1',
  eventType: 'TERMINATION',
  eventTimestamp: '2026-01-01T00:00:00Z',
};
const upsertEvent: EmployeeEvent = {
  employeeId: '2',
  eventType: 'UPSERT',
  eventTimestamp: '2026-01-01T00:00:00Z',
  data: { name: 'Ana', department: 'Tech', position: 'Dev' },
};

type Deps = {
  dispatcher: { process: jest.Mock<Promise<DispatchResult>, [EmployeeEvent]> };
  queue: {
    receiveMessages: jest.Mock<Promise<IQueueMessage[]>, [string, number]>;
    sendMessage: jest.Mock<Promise<void>, [string, string]>;
    sendMessageBatch: jest.Mock<Promise<void>, [string, string[]]>;
    deleteMessage: jest.Mock<Promise<void>, [string, string]>;
  };
  circuitBreaker: {
    isOpen: jest.Mock<boolean, []>;
    tryProceed: jest.Mock<boolean, []>;
    recordSuccess: jest.Mock<void, []>;
    recordFailure: jest.Mock<void, []>;
  };
  logger: {
    info: jest.Mock<void, [Record<string, unknown>]>;
    warn: jest.Mock<void, [Record<string, unknown>]>;
    error: jest.Mock<void, [Record<string, unknown>]>;
  };
  sleepFn: jest.Mock<Promise<void>, [number]>;
};

function makeDeps(): Deps {
  return {
    dispatcher: {
      process: jest.fn<Promise<DispatchResult>, [EmployeeEvent]>(),
    },
    queue: {
      receiveMessages: jest.fn<Promise<IQueueMessage[]>, [string, number]>(),
      sendMessage: jest.fn<Promise<void>, [string, string]>(),
      sendMessageBatch: jest.fn<Promise<void>, [string, string[]]>(),
      deleteMessage: jest.fn<Promise<void>, [string, string]>(),
    },
    circuitBreaker: {
      isOpen: jest.fn<boolean, []>(),
      tryProceed: jest.fn<boolean, []>().mockReturnValue(true),
      recordSuccess: jest.fn<void, []>(),
      recordFailure: jest.fn<void, []>(),
    },
    logger: {
      info: jest.fn<void, [Record<string, unknown>]>(),
      warn: jest.fn<void, [Record<string, unknown>]>(),
      error: jest.fn<void, [Record<string, unknown>]>(),
    },
    sleepFn: jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined),
  };
}

function makeWorker(deps: Deps): DispatcherWorker {
  return new DispatcherWorker(
    deps.dispatcher,
    deps.queue,
    deps.circuitBreaker,
    config,
    deps.logger,
    deps.sleepFn,
  );
}

describe('DispatcherWorker', () => {
  it('sleeps and skips polling when the circuit is open', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(true);
    await makeWorker(deps).runOnce();
    expect(deps.sleepFn).toHaveBeenCalledWith(30_000);
    expect(deps.queue.receiveMessages).not.toHaveBeenCalled();
  });

  it('processes the termination queue first and deletes ACKed messages', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(false);
    deps.queue.receiveMessages.mockResolvedValueOnce([
      { body: JSON.stringify(termEvent), receiptHandle: 'r1' },
    ]);
    deps.dispatcher.process.mockResolvedValue('ACK');
    await makeWorker(deps).runOnce();
    expect(deps.queue.receiveMessages).toHaveBeenCalledTimes(1);
    expect(deps.queue.receiveMessages).toHaveBeenCalledWith('term-url', 10);
    expect(deps.dispatcher.process).toHaveBeenCalledWith(termEvent);
    expect(deps.queue.deleteMessage).toHaveBeenCalledWith('term-url', 'r1');
  });

  it('falls back to the upsert queue and leaves RETRY messages', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(false);
    deps.queue.receiveMessages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { body: JSON.stringify(upsertEvent), receiptHandle: 'r2' },
      ]);
    deps.dispatcher.process.mockResolvedValue('RETRY');
    await makeWorker(deps).runOnce();
    expect(deps.queue.receiveMessages).toHaveBeenNthCalledWith(
      1,
      'term-url',
      10,
    );
    expect(deps.queue.receiveMessages).toHaveBeenNthCalledWith(
      2,
      'upsert-url',
      10,
    );
    expect(deps.dispatcher.process).toHaveBeenCalledWith(upsertEvent);
    expect(deps.queue.deleteMessage).not.toHaveBeenCalled();
  });

  it('idles when both queues are empty', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(false);
    deps.queue.receiveMessages.mockResolvedValue([]);
    await makeWorker(deps).runOnce();
    expect(deps.sleepFn).toHaveBeenCalledWith(5_000);
  });

  it('logs and RETRYs (no ACK) on an invalid message body', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(false);
    deps.queue.receiveMessages.mockResolvedValueOnce([
      { body: 'not-json', receiptHandle: 'r3' },
    ]);
    await makeWorker(deps).runOnce();
    expect(deps.dispatcher.process).not.toHaveBeenCalled();
    expect(deps.queue.deleteMessage).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR' }),
    );
  });

  it('isolates a failed message without dropping the rest of the batch', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(false);
    deps.queue.receiveMessages.mockResolvedValueOnce([
      { body: JSON.stringify(termEvent), receiptHandle: 'a' },
      { body: JSON.stringify(termEvent), receiptHandle: 'b' },
    ]);
    // process rejeita (ex.: erro inesperado no DynamoDB): allSettled isola a falha.
    deps.dispatcher.process
      .mockRejectedValueOnce(new Error('dynamo down'))
      .mockRejectedValueOnce('weird');
    await makeWorker(deps).runOnce();
    expect(deps.dispatcher.process).toHaveBeenCalledTimes(2);
    expect(deps.queue.deleteMessage).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ERROR',
        error: 'Failed to settle message: dynamo down',
      }),
    );
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ERROR',
        error: 'Failed to settle message: weird',
      }),
    );
  });

  it('runs cycles until stopped', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(true);
    const worker = makeWorker(deps);
    deps.sleepFn.mockImplementation(() => {
      worker.stop();
      return Promise.resolve();
    });
    await worker.start();
    expect(deps.circuitBreaker.isOpen).toHaveBeenCalledTimes(1);
  });

  it('defaults to the real sleep helper when none is injected', async () => {
    const deps = makeDeps();
    deps.circuitBreaker.isOpen.mockReturnValue(false);
    deps.queue.receiveMessages.mockResolvedValueOnce([
      { body: JSON.stringify(termEvent), receiptHandle: 'r4' },
    ]);
    deps.dispatcher.process.mockResolvedValue('ACK');
    const worker = new DispatcherWorker(
      deps.dispatcher,
      deps.queue,
      deps.circuitBreaker,
      config,
      deps.logger,
    );
    await worker.runOnce();
    expect(deps.queue.deleteMessage).toHaveBeenCalledWith('term-url', 'r4');
  });
});
