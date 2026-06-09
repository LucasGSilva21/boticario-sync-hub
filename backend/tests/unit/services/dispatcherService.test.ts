import { DispatcherService } from '../../../src/services/dispatcherService';
import { CircuitOpenError } from '../../../src/errors/CircuitOpenError';
import type { EmployeeEvent } from '../../../src/types/employee.types';
import type { AcquireResult } from '../../../src/repositories/interfaces/ISyncStateRepository';

type MockedIdempotency = {
  tryAcquire: jest.Mock<Promise<AcquireResult>, [EmployeeEvent]>;
  markCompleted: jest.Mock<Promise<void>, [EmployeeEvent]>;
  markFailed: jest.Mock<Promise<void>, [EmployeeEvent]>;
};

type MockedCircuitBreaker = {
  isOpen: jest.Mock<boolean, []>;
  recordSuccess: jest.Mock<void, []>;
  recordFailure: jest.Mock<void, []>;
};

type MockedMetrics = { count: jest.Mock<void, [string, number?]> };

type Mocks = {
  service: DispatcherService;
  idempotency: MockedIdempotency;
  saasClient: { sendEvent: jest.Mock<Promise<void>, [EmployeeEvent]> };
  circuitBreaker: MockedCircuitBreaker;
  metrics: MockedMetrics;
  logger: {
    info: jest.Mock<void, [Record<string, unknown>]>;
    warn: jest.Mock<void, [Record<string, unknown>]>;
    error: jest.Mock<void, [Record<string, unknown>]>;
  };
};

function makeService(): Mocks {
  const idempotency: MockedIdempotency = {
    tryAcquire: jest.fn<Promise<AcquireResult>, [EmployeeEvent]>(),
    markCompleted: jest.fn<Promise<void>, [EmployeeEvent]>(),
    markFailed: jest.fn<Promise<void>, [EmployeeEvent]>(),
  };
  const saasClient = { sendEvent: jest.fn<Promise<void>, [EmployeeEvent]>() };
  // Fechado por padrão: o caminho feliz não passa pela guarda do circuito.
  const circuitBreaker: MockedCircuitBreaker = {
    isOpen: jest.fn<boolean, []>().mockReturnValue(false),
    recordSuccess: jest.fn<void, []>(),
    recordFailure: jest.fn<void, []>(),
  };
  const metrics: MockedMetrics = { count: jest.fn<void, [string, number?]>() };
  const logger = {
    info: jest.fn<void, [Record<string, unknown>]>(),
    warn: jest.fn<void, [Record<string, unknown>]>(),
    error: jest.fn<void, [Record<string, unknown>]>(),
  };
  const service = new DispatcherService(
    idempotency,
    saasClient,
    circuitBreaker,
    logger,
    metrics,
  );
  return { service, idempotency, saasClient, circuitBreaker, metrics, logger };
}

const event: EmployeeEvent = {
  employeeId: '1',
  eventType: 'UPSERT',
  eventTimestamp: '2026-01-01T00:00:00Z',
  data: { name: 'Ana', department: 'Tech', position: 'Dev' },
};

describe('DispatcherService', () => {
  it('RETRYs without acquiring the lock when the circuit is already open', async () => {
    const { service, idempotency, saasClient, circuitBreaker } = makeService();
    circuitBreaker.isOpen.mockReturnValue(true);
    const result = await service.process(event);
    expect(result).toBe('RETRY');
    expect(idempotency.tryAcquire).not.toHaveBeenCalled();
    expect(saasClient.sendEvent).not.toHaveBeenCalled();
  });

  it('sends, marks completed, logs success and ACKs when the lock is acquired', async () => {
    const { service, idempotency, saasClient, metrics, logger } = makeService();
    idempotency.tryAcquire.mockResolvedValue({ acquired: true });
    saasClient.sendEvent.mockResolvedValue(undefined);
    const result = await service.process(event);
    expect(result).toBe('ACK');
    expect(saasClient.sendEvent).toHaveBeenCalledWith(event);
    expect(idempotency.markCompleted).toHaveBeenCalledWith(event);
    expect(idempotency.markFailed).not.toHaveBeenCalled();
    expect(metrics.count).toHaveBeenCalledWith('employees_processed_total');
    expect(logger.info).toHaveBeenCalledWith({
      employeeId: '1',
      flow: 'UPSERT',
      status: 'SUCCESS',
    });
  });

  it('ACKs without sending when the event is already completed', async () => {
    const { service, idempotency, saasClient, metrics, logger } = makeService();
    idempotency.tryAcquire.mockResolvedValue({
      acquired: false,
      reason: 'ALREADY_COMPLETED',
    });
    const result = await service.process(event);
    expect(result).toBe('ACK');
    expect(saasClient.sendEvent).not.toHaveBeenCalled();
    expect(metrics.count).toHaveBeenCalledWith('idempotency_rejections_total');
    expect(logger.info).toHaveBeenCalledWith({
      employeeId: '1',
      flow: 'UPSERT',
      status: 'SKIPPED',
      reason: 'ALREADY_COMPLETED',
    });
  });

  it('RETRYs without sending when another consumer holds the lock', async () => {
    const { service, idempotency, saasClient, metrics, logger } = makeService();
    idempotency.tryAcquire.mockResolvedValue({
      acquired: false,
      reason: 'LOCK_ACTIVE',
    });
    const result = await service.process(event);
    expect(result).toBe('RETRY');
    expect(saasClient.sendEvent).not.toHaveBeenCalled();
    expect(metrics.count).not.toHaveBeenCalledWith(
      'idempotency_rejections_total',
    );
    expect(logger.info).toHaveBeenCalledWith({
      employeeId: '1',
      flow: 'UPSERT',
      status: 'SKIPPED',
      reason: 'LOCK_ACTIVE',
    });
  });

  it('RETRYs without marking failed when the circuit is open', async () => {
    const { service, idempotency, saasClient } = makeService();
    idempotency.tryAcquire.mockResolvedValue({ acquired: true });
    saasClient.sendEvent.mockRejectedValue(new CircuitOpenError());
    const result = await service.process(event);
    expect(result).toBe('RETRY');
    expect(idempotency.markFailed).not.toHaveBeenCalled();
    expect(idempotency.markCompleted).not.toHaveBeenCalled();
  });

  it('marks failed, logs the error and RETRYs on a transient failure', async () => {
    const { service, idempotency, saasClient, logger } = makeService();
    idempotency.tryAcquire.mockResolvedValue({ acquired: true });
    saasClient.sendEvent.mockRejectedValue(new Error('5xx'));
    const result = await service.process(event);
    expect(result).toBe('RETRY');
    expect(idempotency.markFailed).toHaveBeenCalledWith(event);
    expect(logger.error).toHaveBeenCalledWith({
      employeeId: '1',
      flow: 'UPSERT',
      status: 'ERROR',
      error: '5xx',
    });
  });

  it('stringifies non-Error throwables in the error log', async () => {
    const { service, idempotency, saasClient, logger } = makeService();
    idempotency.tryAcquire.mockResolvedValue({ acquired: true });
    saasClient.sendEvent.mockRejectedValue('boom');
    const result = await service.process(event);
    expect(result).toBe('RETRY');
    expect(logger.error).toHaveBeenCalledWith({
      employeeId: '1',
      flow: 'UPSERT',
      status: 'ERROR',
      error: 'boom',
    });
  });
});
