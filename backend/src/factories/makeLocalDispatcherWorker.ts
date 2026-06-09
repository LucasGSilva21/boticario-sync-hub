import { CircuitBreaker } from '../utils/circuitBreaker';
import { DispatcherService } from '../services/dispatcherService';
import { IdempotencyService } from '../services/idempotencyService';
import { SaaSHttpClient } from '../providers/SaaSHttpClient';
import { DispatcherWorker } from '../workers/dispatcher/DispatcherWorker';
import { InMemoryQueueProvider } from '../providers/inmemory/InMemoryQueueProvider';
import { InMemorySecretProvider } from '../providers/inmemory/InMemorySecretProvider';
import {
  createStubSaaSFetch,
  type StubFetchOptions,
} from '../providers/inmemory/createStubSaaSFetch';
import { InMemorySyncStateRepository } from '../repositories/inmemory/InMemorySyncStateRepository';
import { ManualClock } from '../workers/dispatcher/demo/ManualClock';
import { logger as defaultLogger } from '../utils/logger';
import type { ILogger } from '../utils/interfaces/ILogger';

export const TERMINATION_QUEUE = 'termination-queue';
export const UPSERT_QUEUE = 'upsert-queue';

export interface LocalWorkerOptions {
  stub?: StubFetchOptions;
  circuitBreaker?: { resetSeconds: number; failureThreshold: number };
  maxRetryAttempts?: number;
  lockTimeoutSeconds?: number;
  rateLimitPerSecond?: number;
  backoffBaseMs?: number;
  clock?: ManualClock;
  logger?: ILogger;
}

export interface LocalDispatcher {
  worker: DispatcherWorker;
  queue: InMemoryQueueProvider;
  clock: ManualClock;
}

/**
 * Monta o worker em modo demo: providers in-memory + SaaSHttpClient REAL com
 * `fetch` stubado. Não faz seed (a orquestração da demo semeia por cenário) e
 * usa um relógio manual compartilhado pelo Circuit Breaker, pelo repositório,
 * pelo IdempotencyService e pelo sleep do worker — exercitando backoff, rate
 * limit e abertura/recuperação do circuito de forma determinística, sem AWS.
 */
export function makeLocalDispatcherWorker(
  options: LocalWorkerOptions = {},
): LocalDispatcher {
  const {
    stub = {},
    circuitBreaker: cbConfig = { resetSeconds: 2, failureThreshold: 5 },
    maxRetryAttempts = 3,
    lockTimeoutSeconds = 240,
    rateLimitPerSecond = 100,
    backoffBaseMs = 50,
    clock = new ManualClock(),
    logger = defaultLogger,
  } = options;

  const secretProvider = new InMemorySecretProvider({
    baseUrl: 'http://stub-saas',
    apiKey: 'demo-key',
  });
  const queue = new InMemoryQueueProvider();
  const repository = new InMemorySyncStateRepository(clock.now);
  const circuitBreaker = new CircuitBreaker(
    cbConfig.resetSeconds,
    cbConfig.failureThreshold,
    clock.now,
  );

  const saasClient = new SaaSHttpClient(
    secretProvider,
    circuitBreaker,
    logger,
    rateLimitPerSecond,
    maxRetryAttempts,
    backoffBaseMs,
    createStubSaaSFetch(stub),
  );
  const idempotency = new IdempotencyService(
    repository,
    lockTimeoutSeconds,
    () => new Date(clock.now()),
  );
  const dispatcher = new DispatcherService(idempotency, saasClient, logger);

  const worker = new DispatcherWorker(
    dispatcher,
    queue,
    circuitBreaker,
    {
      terminationQueueUrl: TERMINATION_QUEUE,
      upsertQueueUrl: UPSERT_QUEUE,
      circuitBreakerResetMs: cbConfig.resetSeconds * 1000,
    },
    logger,
    (ms) => {
      clock.advance(ms);
      return Promise.resolve();
    },
  );

  return { worker, queue, clock };
}
