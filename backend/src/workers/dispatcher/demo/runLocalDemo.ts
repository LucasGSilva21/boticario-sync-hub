import {
  makeLocalDispatcherWorker,
  TERMINATION_QUEUE,
  UPSERT_QUEUE,
  type LocalDispatcher,
} from '../../../factories/makeLocalDispatcherWorker';
import { logger } from '../../../utils/logger';
import type { ILogger, LogFields } from '../../../utils/interfaces/ILogger';
import type {
  EmployeeUpsertEvent,
  TerminationEvent,
} from '../../../types/employee.types';

/** Logger que delega ao real e contabiliza ocorrências por `status`. */
class TallyLogger implements ILogger {
  readonly counts: Record<string, number> = {};

  constructor(private readonly delegate: ILogger) {}

  info(fields: LogFields): void {
    this.tally(fields);
    this.delegate.info(fields);
  }

  warn(fields: LogFields): void {
    this.tally(fields);
    this.delegate.warn(fields);
  }

  error(fields: LogFields): void {
    this.tally(fields);
    this.delegate.error(fields);
  }

  private tally(fields: LogFields): void {
    const status =
      typeof fields.status === 'string' ? fields.status : undefined;
    if (status !== undefined) {
      this.counts[status] = (this.counts[status] ?? 0) + 1;
    }
  }
}

function section(title: string, description: string): void {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`  ${description}`);
  console.log('='.repeat(72));
}

function upsert(id: string, name: string): EmployeeUpsertEvent {
  return {
    employeeId: id,
    eventType: 'UPSERT',
    eventTimestamp: new Date().toISOString(),
    data: { name, department: 'Technology', position: 'Engineer' },
  };
}

function termination(id: string): TerminationEvent {
  return {
    employeeId: id,
    eventType: 'TERMINATION',
    eventTimestamp: new Date().toISOString(),
  };
}

function seedUpserts(d: LocalDispatcher, events: EmployeeUpsertEvent[]): void {
  d.queue.seed(
    UPSERT_QUEUE,
    events.map((e) => JSON.stringify(e)),
  );
}

function seedTerminations(
  d: LocalDispatcher,
  events: TerminationEvent[],
): void {
  d.queue.seed(
    TERMINATION_QUEUE,
    events.map((e) => JSON.stringify(e)),
  );
}

/** Roda ciclos priorizados (termination → upsert) até drenar ou atingir o teto. */
async function drain(d: LocalDispatcher, maxCycles: number): Promise<void> {
  let cycles = 0;
  while (d.queue.size() > 0 && cycles < maxCycles) {
    await d.worker.runOnce();
    cycles += 1;
  }
}

async function scenarioPriorityAndBackoff(tally: ILogger): Promise<void> {
  section(
    'Cenário 1 — Priorização + Retry/Backoff',
    'Demissões antes de upserts; a 1ª chamada falha 3x (503) e recupera.',
  );
  const d = makeLocalDispatcherWorker({
    logger: tally,
    stub: { failFirst: 3, latencyMs: 5 },
    maxRetryAttempts: 3,
  });
  seedTerminations(d, [termination('T-1'), termination('T-2')]);
  seedUpserts(d, [upsert('U-1', 'Ana'), upsert('U-2', 'Bruno')]);
  await drain(d, 100);
}

async function scenarioVolumeAndRateLimit(tally: ILogger): Promise<void> {
  section(
    'Cenário 2 — Volume + Controle de Vazão (Rate Limit)',
    'Lote de upserts cadenciado a 100 req/s (Bottleneck), sem estourar 429.',
  );
  const total = 30;
  const rateLimitPerSecond = 100;
  const d = makeLocalDispatcherWorker({
    logger: tally,
    rateLimitPerSecond,
  });
  seedUpserts(
    d,
    Array.from({ length: total }, (_, i) =>
      upsert(`B-${i + 1}`, `Colab ${i + 1}`),
    ),
  );
  const startedAt = Date.now();
  await drain(d, 100);
  const elapsedMs = Date.now() - startedAt;
  const minTimeMs = Math.ceil(1000 / rateLimitPerSecond);
  const rps = Math.round((total / (elapsedMs + minTimeMs)) * 1000);
  console.log(
    `  → ${total} eventos enviados em ${elapsedMs}ms (~${rps} req/s sustentado; limite ${rateLimitPerSecond}/s)`,
  );
}

async function scenarioDefinitiveFailure(tally: ILogger): Promise<void> {
  section(
    'Cenário 3 — Falha Definitiva → DLQ',
    'SaaS sempre 503: esgota os retries e, após maxReceiveCount, iria para a DLQ.',
  );
  const maxReceiveCount = 3;
  const d = makeLocalDispatcherWorker({
    logger: tally,
    stub: { failFirst: Number.POSITIVE_INFINITY },
    maxRetryAttempts: 3,
    circuitBreaker: { resetSeconds: 2, failureThreshold: 1000 },
  });
  seedTerminations(d, [termination('T-DEAD')]);
  await drain(d, maxReceiveCount);
  console.log(
    `  → T-DEAD falhou ${maxReceiveCount}x (maxReceiveCount). Em produção: SQS redrive → employee-termination-dlq.`,
  );
}

async function scenarioCircuitBreaker(tally: ILogger): Promise<void> {
  section(
    'Cenário 4 — Circuit Breaker (abre e recupera)',
    '5 falhas consecutivas abrem o circuito; após o reset, half-open → closed.',
  );
  const d = makeLocalDispatcherWorker({
    logger: tally,
    stub: { failFirst: 5 },
    maxRetryAttempts: 1,
    lockTimeoutSeconds: 1,
    circuitBreaker: { resetSeconds: 2, failureThreshold: 5 },
  });
  seedUpserts(
    d,
    Array.from({ length: 7 }, (_, i) => upsert(`C-${i + 1}`, `Colab ${i + 1}`)),
  );
  await drain(d, 100);
}

async function scenarioIdempotency(tally: ILogger): Promise<void> {
  section(
    'Cenário 5 — Idempotência (Zero-Read)',
    'Reenvio do mesmo evento é descartado (ALREADY_COMPLETED), sem nova chamada ao SaaS.',
  );
  const d = makeLocalDispatcherWorker({ logger: tally });
  const event = upsert('U-DUP', 'Ana');
  seedUpserts(d, [event]);
  await drain(d, 100); // 1ª vez → SUCCESS (COMPLETED)
  seedUpserts(d, [event]); // mesmo payload → mesmo hash
  await drain(d, 100); // 2ª vez → SKIPPED (idempotência)
}

function printSummary(tally: TallyLogger): void {
  section('Resumo da Execução', 'Totais consolidados (alimentam o dashboard).');
  console.log(`  ✅ Sucessos:      ${tally.counts.SUCCESS ?? 0}`);
  console.log(`  ❌ Erros:         ${tally.counts.ERROR ?? 0}`);
  console.log(`  🔁 Retentativas:  ${tally.counts.RETRY ?? 0}`);
  console.log(`  ⏭️  Idempotência:  ${tally.counts.SKIPPED ?? 0}`);
  console.log('');
}

export async function runLocalDemo(): Promise<void> {
  const tally = new TallyLogger(logger);
  await scenarioPriorityAndBackoff(tally);
  await scenarioVolumeAndRateLimit(tally);
  await scenarioDefinitiveFailure(tally);
  await scenarioCircuitBreaker(tally);
  await scenarioIdempotency(tally);
  printSummary(tally);
}
