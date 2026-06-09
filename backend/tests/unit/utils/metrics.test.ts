import { EmfMetrics, NoopMetrics } from '../../../src/utils/metrics';

describe('EmfMetrics', () => {
  let logSpy: jest.SpyInstance<void, [unknown?, ...unknown[]]>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function emittedDocument(): Record<string, unknown> {
    const raw = logSpy.mock.calls[0]?.[0];
    return JSON.parse(String(raw)) as Record<string, unknown>;
  }

  it('emits an EMF document in the BoticarioSyncHub namespace with the metric', () => {
    new EmfMetrics().count('saas_requests_total');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const doc = emittedDocument();
    expect(doc).toMatchObject({
      _aws: {
        CloudWatchMetrics: [
          {
            Namespace: 'BoticarioSyncHub',
            Dimensions: [[]],
            Metrics: [{ Name: 'saas_requests_total', Unit: 'Count' }],
          },
        ],
      },
      saas_requests_total: 1,
    });
    expect(typeof (doc._aws as { Timestamp: unknown }).Timestamp).toBe(
      'number',
    );
  });

  it('defaults the count to 1 and honors an explicit value', () => {
    const metrics = new EmfMetrics();
    metrics.count('circuit_breaker_open_total', 3);
    const doc = emittedDocument();
    expect(doc.circuit_breaker_open_total).toBe(3);
  });
});

describe('NoopMetrics', () => {
  it('does not write anything to stdout', () => {
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    new NoopMetrics().count();
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
