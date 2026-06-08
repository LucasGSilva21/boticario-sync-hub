import { SaaSHttpClient } from '../../../src/providers/SaaSHttpClient';
import { CircuitOpenError } from '../../../src/errors/CircuitOpenError';
import type { EmployeeEvent } from '../../../src/types/employee.types';
import type { SaaSCredentials } from '../../../src/providers/interfaces/ISecretProvider';
import type { ISecretProvider } from '../../../src/providers/interfaces/ISecretProvider';

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
    const fetchFn = makeFetch().mockResolvedValue(response(200));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
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
  });

  it('retries on 5xx, recording failure then success', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const fetchFn = makeFetch()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      1000,
      3,
      1,
      fetchFn,
    );
    await client.sendEvent(event);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.recordSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 4xx and does not trip the breaker', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const fetchFn = makeFetch().mockResolvedValue(response(400));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      1000,
      3,
      1,
      fetchFn,
    );
    await expect(client.sendEvent(event)).rejects.toThrow('status 400');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    expect(circuitBreaker.recordSuccess).not.toHaveBeenCalled();
  });

  it('retries network errors and records a failure on each attempt', async () => {
    const circuitBreaker = makeCircuitBreaker(false);
    const fetchFn = makeFetch().mockRejectedValue(new TypeError('network'));
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
      1000,
      2,
      1,
      fetchFn,
    );
    await expect(client.sendEvent(event)).rejects.toThrow('network');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(2);
  });

  it('throws CircuitOpenError without calling fetch when the breaker is open', async () => {
    const circuitBreaker = makeCircuitBreaker(true);
    const fetchFn = makeFetch();
    const client = new SaaSHttpClient(
      makeSecretProvider(),
      circuitBreaker,
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
  });

  it('uses the global fetch by default', () => {
    expect(
      () =>
        new SaaSHttpClient(
          makeSecretProvider(),
          makeCircuitBreaker(false),
          1000,
          3,
          1,
        ),
    ).not.toThrow();
  });
});
