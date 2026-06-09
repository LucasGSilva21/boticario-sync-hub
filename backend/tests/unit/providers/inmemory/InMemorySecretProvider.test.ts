import { InMemorySecretProvider } from '../../../../src/providers/inmemory/InMemorySecretProvider';

describe('InMemorySecretProvider', () => {
  it('returns the configured credentials', async () => {
    const provider = new InMemorySecretProvider({
      baseUrl: 'http://stub',
      apiKey: 'demo',
    });

    await expect(provider.getSaaSCredentials()).resolves.toEqual({
      baseUrl: 'http://stub',
      apiKey: 'demo',
    });
  });
});
