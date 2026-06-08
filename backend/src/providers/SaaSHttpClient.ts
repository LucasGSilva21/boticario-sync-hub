import Bottleneck from 'bottleneck';
import { withBackoff } from '../utils/backoff';
import type { EmployeeEvent } from '../types/employee.types';
import type { ICircuitBreaker } from '../utils/interfaces/ICircuitBreaker';
import type { ISaaSClient } from './interfaces/ISaaSClient';
import type { ISecretProvider } from './interfaces/ISecretProvider';

export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}

export class SaaSRequestError extends Error {
  constructor(readonly status: number) {
    super(`SaaS request failed with status ${status}`);
    this.name = 'SaaSRequestError';
  }
}

function isTransientFailure(error: unknown): boolean {
  if (error instanceof CircuitOpenError) {
    return false;
  }
  if (error instanceof SaaSRequestError) {
    return error.status >= 500;
  }
  return true;
}

type FetchFn = typeof fetch;

export class SaaSHttpClient implements ISaaSClient {
  private readonly limiter: Bottleneck;

  constructor(
    private readonly secretProvider: ISecretProvider,
    private readonly circuitBreaker: ICircuitBreaker,
    rateLimitPerSecond: number,
    private readonly maxRetryAttempts: number,
    private readonly backoffBaseMs: number,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.limiter = new Bottleneck({
      minTime: Math.ceil(1000 / rateLimitPerSecond),
      maxConcurrent: rateLimitPerSecond,
    });
  }

  async sendEvent(event: EmployeeEvent): Promise<void> {
    await withBackoff(() => this.attempt(event), {
      maxAttempts: this.maxRetryAttempts,
      baseMs: this.backoffBaseMs,
      shouldRetry: isTransientFailure,
    });
  }

  private async attempt(event: EmployeeEvent): Promise<void> {
    if (this.circuitBreaker.isOpen()) {
      throw new CircuitOpenError();
    }
    try {
      await this.limiter.schedule(() => this.doRequest(event));
      this.circuitBreaker.recordSuccess();
    } catch (error) {
      if (isTransientFailure(error)) {
        this.circuitBreaker.recordFailure();
      }
      throw error;
    }
  }

  private async doRequest(event: EmployeeEvent): Promise<void> {
    const { baseUrl, apiKey } = await this.secretProvider.getSaaSCredentials();
    const response = await this.fetchFn(`${baseUrl}/employees`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new SaaSRequestError(response.status);
    }
  }
}
