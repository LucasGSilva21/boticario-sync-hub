import { createStubSaaSFetch } from '../../../../src/providers/inmemory/createStubSaaSFetch';

describe('createStubSaaSFetch', () => {
  it('returns 503 for the first N calls then 200', async () => {
    const stub = createStubSaaSFetch({ failFirst: 2 });

    expect((await stub('http://stub')).status).toBe(503);
    expect((await stub('http://stub')).status).toBe(503);
    expect((await stub('http://stub')).status).toBe(200);
  });

  it('applies the configured latency before responding', async () => {
    const stub = createStubSaaSFetch({ latencyMs: 1 });

    expect((await stub('http://stub')).status).toBe(200);
  });
});
