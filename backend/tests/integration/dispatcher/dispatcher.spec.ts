import { DispatcherWorker } from '../../../src/workers/dispatcher/DispatcherWorker';
import { DispatcherService } from '../../../src/services/dispatcherService';
import { IdempotencyService } from '../../../src/services/idempotencyService';
import { SaaSHttpClient } from '../../../src/providers/SaaSHttpClient';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker';
import { InMemoryQueueProvider } from '../../../src/providers/inmemory/InMemoryQueueProvider';
import { InMemorySecretProvider } from '../../../src/providers/inmemory/InMemorySecretProvider';
import { InMemorySyncStateRepository } from '../../../src/repositories/inmemory/InMemorySyncStateRepository';
import { noopMetrics } from '../../../src/utils/metrics';
import { generateHash } from '../../../src/utils/hashGenerator';
import type {
  EmployeeUpsertEvent,
  TerminationEvent,
} from '../../../src/types/employee.types';
import type { LogFields } from '../../../src/utils/interfaces/ILogger';

const TERMINATION_QUEUE = 'termination-queue';
const UPSERT_QUEUE = 'upsert-queue';

// Relógio mutável local da suíte (não o ManualClock de demo/, fora da cobertura):
// compartilhado pelo Circuit Breaker, repositório e IdempotencyService, e avançado
// pelo sleepFn do worker — torna a recuperação do circuito instantânea e determinística.
class TestClock {
  constructor(private current = 0) {}
  now = (): number => this.current;
  advance(ms: number): void {
    this.current += ms;
  }
}

type TestLogger = {
  info: jest.Mock<void, [LogFields]>;
  warn: jest.Mock<void, [LogFields]>;
  error: jest.Mock<void, [LogFields]>;
};

function makeLogger(): TestLogger {
  return {
    info: jest.fn<void, [LogFields]>(),
    warn: jest.fn<void, [LogFields]>(),
    error: jest.fn<void, [LogFields]>(),
  };
}

function makeFetch(): jest.Mock<Promise<Response>, Parameters<typeof fetch>> {
  return jest.fn<Promise<Response>, Parameters<typeof fetch>>();
}

function okFetch(): jest.Mock<Promise<Response>, Parameters<typeof fetch>> {
  return makeFetch().mockResolvedValue(new Response(null, { status: 200 }));
}

interface BuildOptions {
  fetchFn: jest.Mock<Promise<Response>, Parameters<typeof fetch>>;
  maxRetryAttempts?: number;
  failureThreshold?: number;
  resetSeconds?: number;
  lockTimeoutSeconds?: number;
  backoffBaseMs?: number;
}

function buildDispatcher(opts: BuildOptions): {
  worker: DispatcherWorker;
  queue: InMemoryQueueProvider;
  repository: InMemorySyncStateRepository;
  circuitBreaker: CircuitBreaker;
  clock: TestClock;
  logger: TestLogger;
} {
  const {
    fetchFn,
    maxRetryAttempts = 3,
    failureThreshold = 5,
    resetSeconds = 30,
    lockTimeoutSeconds = 240,
    backoffBaseMs = 1,
  } = opts;

  const clock = new TestClock();
  const logger = makeLogger();
  const queue = new InMemoryQueueProvider();
  const repository = new InMemorySyncStateRepository(clock.now);
  const circuitBreaker = new CircuitBreaker(
    resetSeconds,
    failureThreshold,
    clock.now,
  );
  const secretProvider = new InMemorySecretProvider({
    baseUrl: 'https://saas.test',
    apiKey: 'test-key',
  });
  const saasClient = new SaaSHttpClient(
    secretProvider,
    circuitBreaker,
    logger,
    noopMetrics,
    1000,
    maxRetryAttempts,
    backoffBaseMs,
    fetchFn,
  );
  const idempotency = new IdempotencyService(
    repository,
    lockTimeoutSeconds,
    () => new Date(clock.now()),
  );
  const dispatcher = new DispatcherService(
    idempotency,
    saasClient,
    circuitBreaker,
    logger,
    noopMetrics,
  );
  const worker = new DispatcherWorker(
    dispatcher,
    queue,
    circuitBreaker,
    {
      terminationQueueUrl: TERMINATION_QUEUE,
      upsertQueueUrl: UPSERT_QUEUE,
      circuitBreakerResetMs: resetSeconds * 1000,
    },
    logger,
    (ms) => {
      clock.advance(ms);
      return Promise.resolve();
    },
  );

  return { worker, queue, repository, circuitBreaker, clock, logger };
}

const upsertEvent: EmployeeUpsertEvent = {
  employeeId: 'u1',
  eventType: 'UPSERT',
  eventTimestamp: '2026-01-01T00:00:00.000Z',
  data: { name: 'Ana', department: 'Tech', position: 'Dev' },
};

function terminationEvent(id: string): TerminationEvent {
  return {
    employeeId: id,
    eventType: 'TERMINATION',
    eventTimestamp: '2026-01-01T00:00:00.000Z',
  };
}

describe('dispatcher integration', () => {
  it('drains the termination queue before touching the upsert queue', async () => {
    const { worker, queue, logger } = buildDispatcher({ fetchFn: okFetch() });
    queue.seed(TERMINATION_QUEUE, [JSON.stringify(terminationEvent('t1'))]);
    queue.seed(UPSERT_QUEUE, [JSON.stringify(upsertEvent)]);

    await worker.runOnce();

    expect(await queue.receiveMessages(TERMINATION_QUEUE, 10)).toHaveLength(0);
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'TERMINATION', status: 'SUCCESS' }),
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'UPSERT', status: 'SUCCESS' }),
    );
  });

  it('discards a redelivered event without sending it to the SaaS twice', async () => {
    const fetchFn = okFetch();
    const { worker, queue, logger } = buildDispatcher({ fetchFn });
    const body = JSON.stringify(upsertEvent);

    queue.seed(UPSERT_QUEUE, [body]);
    await worker.runOnce();

    queue.seed(UPSERT_QUEUE, [body]); // duplicata reentregue pelo SQS Standard
    await worker.runOnce();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SKIPPED',
        reason: 'ALREADY_COMPLETED',
      }),
    );
  });

  it('retries transient failures with backoff until the SaaS accepts the event', async () => {
    const fetchFn = makeFetch()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { worker, queue, logger } = buildDispatcher({
      fetchFn,
      maxRetryAttempts: 3,
    });
    queue.seed(UPSERT_QUEUE, [JSON.stringify(upsertEvent)]);

    await worker.runOnce();

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'UPSERT', status: 'SUCCESS' }),
    );
  });

  it('leaves the message on the queue when retries are exhausted', async () => {
    const fetchFn = makeFetch().mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    const { worker, queue, logger } = buildDispatcher({
      fetchFn,
      maxRetryAttempts: 2,
      failureThreshold: 5,
    });
    queue.seed(UPSERT_QUEUE, [JSON.stringify(upsertEvent)]);

    await worker.runOnce();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    // Não deletada: volta à fila pelo Visibility Timeout e, após maxReceiveCount, à DLQ.
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ flow: 'UPSERT', status: 'ERROR' }),
    );
  });

  it('half-opens to a single probe after the cooldown and recovers once the SaaS heals', async () => {
    const fetchFn = makeFetch()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { worker, queue, circuitBreaker, clock } = buildDispatcher({
      fetchFn,
      maxRetryAttempts: 1,
      failureThreshold: 3,
      resetSeconds: 30,
      lockTimeoutSeconds: 5,
    });
    queue.seed(
      TERMINATION_QUEUE,
      ['t1', 't2', 't3'].map((id) => JSON.stringify(terminationEvent(id))),
    );
    // Ciclo 1: três falhas concorrentes abrem o circuito; nada é deletado.
    await worker.runOnce();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(circuitBreaker.isOpen()).toBe(true);
    expect(await queue.receiveMessages(TERMINATION_QUEUE, 10)).toHaveLength(3);
    // Ciclo 2: circuito aberto suspende o polling (sleepFn avança o relógio +30s).
    await worker.runOnce();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(await queue.receiveMessages(TERMINATION_QUEUE, 10)).toHaveLength(3);
    // Ciclo 3: passado o reset, o HALF_OPEN admite UMA sonda (single-trial). Mesmo
    // com o lote concorrente, só 1 request vai ao SaaS — ela tem sucesso e fecha o
    // circuito. As outras 2 são barradas (CircuitOpenError) e voltam à fila, mas
    // como adquiriram o lock antes do gate, ficam em PROCESSING (lock transitório).
    await worker.runOnce();
    expect(fetchFn).toHaveBeenCalledTimes(4); // apenas a sonda
    expect(circuitBreaker.isOpen()).toBe(false);
    expect(await queue.receiveMessages(TERMINATION_QUEUE, 10)).toHaveLength(2);
    // Expira o lock transitório das 2 barradas (recuperação de órfão via lockExpiresAt).
    clock.advance(6_000);
    // Ciclo 4: circuito fechado e locks expirados → as 2 restantes drenam.
    await worker.runOnce();
    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(await queue.receiveMessages(TERMINATION_QUEUE, 10)).toHaveLength(0);
  });

  it('blocks an event under an active lock and recovers it once the lock expires', async () => {
    const fetchFn = okFetch();
    const { worker, queue, repository, clock, logger } = buildDispatcher({
      fetchFn,
      lockTimeoutSeconds: 240,
    });
    // Outro consumidor detém o lock, válido por 100s a partir de agora.
    await repository.tryAcquireProcessing(
      upsertEvent.employeeId,
      generateHash(upsertEvent),
      'UPSERT',
      new Date(clock.now() + 100_000),
    );
    queue.seed(UPSERT_QUEUE, [JSON.stringify(upsertEvent)]);

    await worker.runOnce();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SKIPPED', reason: 'LOCK_ACTIVE' }),
    );

    // Lock expira → evento órfão recuperável.
    clock.advance(150_000);
    await worker.runOnce();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(0);
  });
});
