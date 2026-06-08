import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import type {
  ISecretProvider,
  SaaSCredentials,
} from './interfaces/ISecretProvider';

interface CachedCredentials {
  value: SaaSCredentials;
  expiresAt: number;
}

export class SecretsManagerProvider implements ISecretProvider {
  private cache: CachedCredentials | undefined;

  constructor(
    private readonly secretName: string,
    private readonly cacheTtlSeconds: number,
    private readonly client: SecretsManagerClient = new SecretsManagerClient(
      {},
    ),
    private readonly now: () => number = Date.now,
  ) {}

  async getSaaSCredentials(): Promise<SaaSCredentials> {
    if (this.cache && this.now() < this.cache.expiresAt) {
      return this.cache.value;
    }

    const { SecretString } = await this.client.send(
      new GetSecretValueCommand({ SecretId: this.secretName }),
    );

    if (SecretString === undefined) {
      throw new Error(`Secret ${this.secretName} has no SecretString`);
    }

    const value = this.parse(SecretString);
    this.cache = {
      value,
      expiresAt: this.now() + this.cacheTtlSeconds * 1000,
    };
    return value;
  }

  private parse(secretString: string): SaaSCredentials {
    const parsed: unknown = JSON.parse(secretString);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'baseUrl' in parsed &&
      'apiKey' in parsed &&
      typeof parsed.baseUrl === 'string' &&
      typeof parsed.apiKey === 'string'
    ) {
      return { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey };
    }

    throw new Error(`Secret ${this.secretName} has an invalid structure`);
  }
}
