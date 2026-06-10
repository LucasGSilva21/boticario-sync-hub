import Bottleneck from 'bottleneck';
import { withBackoff } from '../utils/backoff';
import { CircuitOpenError } from '../errors/CircuitOpenError';
import { SaaSRequestError } from '../errors/SaaSRequestError';
import type { EmployeeEvent } from '../types/employee.types';
import type { ICircuitBreaker } from '../utils/interfaces/ICircuitBreaker';
import type { ILogger } from '../utils/interfaces/ILogger';
import type { IMetrics } from '../utils/interfaces/IMetrics';
import type { ISaaSClient } from './interfaces/ISaaSClient';
import type { ISecretProvider } from './interfaces/ISecretProvider';

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
    private readonly logger: ILogger,
    private readonly metrics: IMetrics,
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
      onRetry: ({ attempt, nextDelayMs, error }) => {
        this.logger.warn({
          employeeId: event.employeeId,
          flow: event.eventType,
          status: 'RETRY',
          attempt,
          maxAttempts: this.maxRetryAttempts,
          nextDelayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  private async attempt(event: EmployeeEvent): Promise<void> {
    // Gate por tentativa: no half-open, só a sonda passa (single-trial).
    if (!this.circuitBreaker.tryProceed()) {
      throw new CircuitOpenError();
    }
    this.metrics.count('saas_requests_total');
    try {
      await this.limiter.schedule(() => this.doRequest(event));
      this.circuitBreaker.recordSuccess();
      this.metrics.count('saas_requests_success');
    } catch (error) {
      if (isTransientFailure(error)) {
        this.circuitBreaker.recordFailure();
        this.metrics.count('saas_requests_failed');
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
