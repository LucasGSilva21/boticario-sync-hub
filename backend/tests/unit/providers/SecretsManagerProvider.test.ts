import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SecretsManagerProvider } from '../../../src/providers/SecretsManagerProvider';

const validSecret = JSON.stringify({ baseUrl: 'https://api', apiKey: 'k' });

describe('SecretsManagerProvider', () => {
  it('fetches, parses and caches the credentials within the TTL', async () => {
    let current = 0;
    const sendMock = jest.fn().mockResolvedValue({ SecretString: validSecret });
    const client = { send: sendMock } as unknown as SecretsManagerClient;
    const provider = new SecretsManagerProvider(
      'secret',
      300,
      client,
      () => current,
    );
    const first = await provider.getSaaSCredentials();
    expect(first).toEqual({ baseUrl: 'https://api', apiKey: 'k' });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ input: { SecretId: 'secret' } }),
    );
    current += 299_000;
    await provider.getSaaSCredentials();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache TTL expires', async () => {
    let current = 0;
    const sendMock = jest.fn().mockResolvedValue({ SecretString: validSecret });
    const client = { send: sendMock } as unknown as SecretsManagerClient;

    const provider = new SecretsManagerProvider(
      'secret',
      300,
      client,
      () => current,
    );

    await provider.getSaaSCredentials();
    current += 300_000;
    await provider.getSaaSCredentials();

    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('throws when the secret has no SecretString', async () => {
    const sendMock = jest.fn().mockResolvedValue({ SecretString: undefined });
    const client = { send: sendMock } as unknown as SecretsManagerClient;
    const provider = new SecretsManagerProvider('secret', 300, client);
    await expect(provider.getSaaSCredentials()).rejects.toThrow(
      'Secret secret has no SecretString',
    );
  });

  it.each([
    ['not an object', '123'],
    ['null', 'null'],
    ['missing baseUrl', JSON.stringify({ apiKey: 'k' })],
    ['missing apiKey', JSON.stringify({ baseUrl: 'u' })],
    ['baseUrl not a string', JSON.stringify({ baseUrl: 1, apiKey: 'k' })],
    ['apiKey not a string', JSON.stringify({ baseUrl: 'u', apiKey: 1 })],
  ])('throws on invalid structure: %s', async (_label, secretString) => {
    const sendMock = jest
      .fn()
      .mockResolvedValue({ SecretString: secretString });
    const client = { send: sendMock } as unknown as SecretsManagerClient;
    const provider = new SecretsManagerProvider('secret', 300, client);
    await expect(provider.getSaaSCredentials()).rejects.toThrow(
      'Secret secret has an invalid structure',
    );
  });

  it('uses a default Secrets Manager client when none is provided', () => {
    expect(() => new SecretsManagerProvider('secret', 300)).not.toThrow();
  });
});
