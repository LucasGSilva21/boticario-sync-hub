import { env } from '../config/env';
import { DispatcherWorker } from '../workers/dispatcher/DispatcherWorker';
import { DispatcherService } from '../services/dispatcherService';
import { IdempotencyService } from '../services/idempotencyService';
import { SqsQueueProvider } from '../providers/SqsQueueProvider';
import { SaaSHttpClient } from '../providers/SaaSHttpClient';
import { SecretsManagerProvider } from '../providers/SecretsManagerProvider';
import { DynamoSyncStateRepository } from '../repositories/DynamoSyncStateRepository';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

export function makeDispatcherWorker(): DispatcherWorker {
  const secretProvider = new SecretsManagerProvider(
    env.saasSecretName,
    env.secretsCacheTtlSeconds,
  );
  const queueProvider = new SqsQueueProvider(env.sqsWaitTimeSeconds);
  const syncStateRepo = new DynamoSyncStateRepository(env.dynamoTableName);
  // Mesma instância do Circuit Breaker injetada no cliente (registra falhas)
  // e no worker (controla o polling).
  const circuitBreaker = new CircuitBreaker(
    env.circuitBreakerResetTimeoutSeconds,
    env.circuitBreakerFailureThreshold,
  );
  const saasClient = new SaaSHttpClient(
    secretProvider,
    circuitBreaker,
    env.saasRateLimitPerSecond,
    env.saasMaxRetryAttempts,
    env.saasBackoffBaseMs,
  );
  const idempotencyService = new IdempotencyService(
    syncStateRepo,
    env.processingLockTimeoutSeconds,
  );
  const dispatcherService = new DispatcherService(
    idempotencyService,
    saasClient,
    logger,
  );
  return new DispatcherWorker(
    dispatcherService,
    queueProvider,
    circuitBreaker,
    {
      terminationQueueUrl: env.employeeTerminationQueueUrl,
      upsertQueueUrl: env.employeeUpsertQueueUrl,
      circuitBreakerResetMs: env.circuitBreakerResetTimeoutSeconds * 1000,
    },
    logger,
  );
}
