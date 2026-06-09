import { SaaSHttpClient } from '../../../src/providers/SaaSHttpClient';
import { CircuitOpenError } from '../../../src/errors/CircuitOpenError';
import type { EmployeeEvent } from '../../../src/types/employee.types';
import type { SaaSCredentials } from '../../../src/providers/interfaces/ISecretProvider';
import type { ISecretProvider } from '../../../src/providers/interfaces/ISecretProvider';
import type { LogFields } from '../../../src/utils/interfaces/ILogger';

type MockedCircuitBreaker = {
  isOpen: jest.Mock<boolean, []>;
  recordSuccess: jest.Mock<void, []>;
  recordFailure: jest.Mock<void, []>;
};

function makeCircuitBreaker(open: boolean): MockedCircuitBreaker {
  return {
    isOpen: jest.fn<boolean, []>().mockReturnValue(open),
    recordSuccess: jest.fn<void, []>(),
    recordFailure: jest.fn<void, []>(),
  };
}

function makeSecretProvider(): ISecretProvider {
  return {
    getSaaSCredentials: jest
      .fn<Promise<SaaSCredentials>, []>()
      .mockResolvedValue({ baseUrl: 'https://api', apiKey: 'key' }),
  };
}

type MockedLogger = {
  info: jest.Mock<void, [LogFields]>;
  warn: jest.Mock<void, [LogFields]>;
  error: jest.Mock<void, [LogFields]>;
};

function makeLogger(): MockedLogger {
  return {
    info: jest.fn<void, [LogFields]>(),
    warn: jest.fn<void, [LogFields]>(),
    error: jest.fn<void, [LogFields]>(),
  };
}

type MockedMetrics = { count: jest.Mock<void, [string, number?]> };

function makeMetrics(): MockedMetrics {
  return { count: jest.fn<void, [string, number?]>() };
}

function makeFetch(): jest.Mock<Promise<Response>, Parameters<typeof fetch>> {
  return jest.fn<Promise<Response>, Parameters<typeof fetch>>();
}

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

const event: EmployeeEvent = {
  employeeId: '1',
  eventType: 'UPSERT',
  eventTimestamp: '2026-01-01T00:00:00Z',
  data: { name: 'Ana', department: 'Tech', position: 'Dev' },
};

describe('SaaSHttpClient', () => {
  it('posts the event and records success on 2xx', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const logger = makeLogger();
    const metrics = makeMetrics();
    const fetchFn = makeFetch().mockResolvedValue(response(200));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      logger,
      metrics,
      1000,
      3,
      1,
      fetchFn,
    );
    await client.sendEvent(event);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('https://api/employees', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'key' },
      body: JSON.stringify(event),
    });
    expect(circuitBreaker.recordSuccess).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(metrics.count).toHaveBeenCalledWith('saas_requests_total');
    expect(metrics.count).toHaveBeenCalledWith('saas_requests_success');
  });

  it('retries on 5xx, recording failure then success', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const logger = makeLogger();
    const metrics = makeMetrics();
    const fetchFn = makeFetch()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      logger,
      metrics,
      1000,
      3,
      1,
      fetchFn,
    );
    await client.sendEvent(event);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.recordSuccess).toHaveBeenCalledTimes(1);
    expect(metrics.count).toHaveBeenCalledWith('saas_requests_failed');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warnArg = logger.warn.mock.calls[0]?.[0];
    expect(warnArg).toMatchObject({
      employeeId: '1',
      flow: 'UPSERT',
      status: 'RETRY',
      attempt: 1,
      maxAttempts: 3,
      error: 'SaaS request failed with status 503',
    });
    expect(typeof warnArg?.nextDelayMs).toBe('number');
  });

  it('does not retry on 4xx and does not trip the breaker', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const logger = makeLogger();
    const metrics = makeMetrics();
    const fetchFn = makeFetch().mockResolvedValue(response(400));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      logger,
      metrics,
      1000,
      3,
      1,
      fetchFn,
    );
    await expect(client.sendEvent(event)).rejects.toThrow('status 400');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    expect(circuitBreaker.recordSuccess).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('retries network errors and records a failure on each attempt', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const logger = makeLogger();
    const metrics = makeMetrics();
    const fetchFn = makeFetch().mockRejectedValue(new TypeError('network'));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      logger,
      metrics,
      1000,
      2,
      1,
      fetchFn,
    );
    await expect(client.sendEvent(event)).rejects.toThrow('network');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('serializes non-Error rejection values in the retry log', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const logger = makeLogger();
    const metrics = makeMetrics();
    const fetchFn = makeFetch()
      .mockRejectedValueOnce('kaboom')
      .mockResolvedValueOnce(response(200));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      logger,
      metrics,
      1000,
      3,
      1,
      fetchFn,
    );
    await client.sendEvent(event);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warnArg = logger.warn.mock.calls[0]?.[0];
    expect(warnArg?.error).toBe('kaboom');
  });

  it('throws CircuitOpenError without calling fetch when the breaker is open', async () => {
    const circuitBreaker = makeCircuitBreaker(true);
    const logger = makeLogger();
    const metrics = makeMetrics();
    const fetchFn = makeFetch();
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      logger,
      metrics,
      1000,
      3,
      1,
      fetchFn,
    );
    await expect(client.sendEvent(event)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    expect(circuitBreaker.recordSuccess).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('uses the global fetch by default', () => {
    expect(
      () =>
        new SaaSHttpClient(
          makeSecretProvider(),
          makeCircuitBreaker(false),
          makeLogger(),
          makeMetrics(),
          1000,
          3,
          1,
        ),
    ).not.toThrow();
  });
});
