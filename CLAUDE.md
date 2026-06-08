# CLAUDE.md — boticario-sync-hub

## Leitura Obrigatória

Antes de qualquer ação, leia na íntegra:

1. `docs/ARCHITECTURE.md`
2. `docs/DEVELOPMENT_GUIDE.md`

Esses documentos são a fonte única da verdade. Em caso de conflito:
`ARCHITECTURE.md > DEVELOPMENT_GUIDE.md > CLAUDE.md`

---

## Regras de Comportamento

### Fluxo de Geração (Iterativo)

- Gere **um arquivo por vez**.
- Antes de criar o arquivo, exiba o conteúdo completo e aguarde aprovação explícita.
- Só avance para o próximo arquivo após aprovação.
- Se tiver dúvida sobre comportamento não documentado, pergunte — **não assuma**.

### TypeScript

- `strict: true` em todos os arquivos.
- **Proibido `any`**. Use `unknown` para tipos dinâmicos.
- **Proibido `process.env` fora de `src/config/env.ts`**.
- Declare o tipo de retorno explicitamente em todas as funções e handlers.
- AWS SDK v3 obrigatório (`@aws-sdk/client-*`).

### Arquitetura e DI

- Services e Workers recebem dependências **apenas via interfaces no construtor**.
- Implementações concretas são importadas **somente nos Factories**.
- Interfaces de Providers e Repositories usam **nomes de domínio**:
  - ✅ `IBucketProvider`, `IQueueProvider`, `ISecretProvider`
  - ❌ `IS3Provider`, `ISqsProvider`, `ISecretsManagerProvider`
- Cada entrypoint (Lambda function / Worker) possui **exatamente um Factory**.

### Entrypoints

- `src/functions/*.ts` → exporta o handler AWS, chama o Factory, delega. Nenhuma lógica.
- `src/workers/dispatcher/main.ts` → chama o Factory, chama `worker.start()`. Nenhuma lógica.
- `src/workers/dispatcher/main.local.ts` → entrypoint da demo local; chama `makeLocalDispatcherWorker()` (providers in-memory) e `worker.start()`. Nenhuma lógica.

---

## Ordem de Build Recomendada

Siga esta sequência para manter o grafo de dependências sempre resolvido:

```
Fase 1 — Fundação
  [ ] package.json
  [ ] tsconfig.json
  [ ] jest.config.ts
  [ ] serverless.yml (esqueleto)
  [ ] src/config/env.ts

Fase 2 — Contratos
  [ ] src/types/employee.types.ts
  [ ] src/types/sync-state.types.ts
  [ ] src/providers/interfaces/IBucketProvider.ts
  [ ] src/providers/interfaces/IQueueProvider.ts
  [ ] src/providers/interfaces/ISecretProvider.ts
  [ ] src/providers/interfaces/ISaaSClient.ts
  [ ] src/providers/interfaces/IXmlParser.ts
  [ ] src/repositories/interfaces/ISyncStateRepository.ts

Fase 3 — Utilitários
  [ ] src/utils/logger.ts
  [ ] src/utils/hashGenerator.ts
  [ ] src/utils/sleep.ts
  [ ] src/utils/backoff.ts
  [ ] src/utils/circuitBreaker.ts

Fase 4 — Providers (implementações concretas)
  [ ] src/errors/CircuitOpenError.ts
  [ ] src/errors/SaaSRequestError.ts
  [ ] src/providers/S3BucketProvider.ts
  [ ] src/providers/SqsQueueProvider.ts
  [ ] src/providers/SecretsManagerProvider.ts
  [ ] src/providers/SaxXmlParser.ts
  [ ] src/providers/SaaSHttpClient.ts

Fase 5 — Repositories
  [ ] src/repositories/DynamoSyncStateRepository.ts

Fase 6 — Services
  [ ] src/services/idempotencyService.ts
  [ ] src/services/xmlProcessingService.ts
  [ ] src/services/terminationService.ts
  [ ] src/controllers/TerminationController.ts
  [ ] src/services/dispatcherService.ts

Fase 7 — Worker (lógica do loop)
  [ ] src/workers/dispatcher/DispatcherWorker.ts

Fase 8 — Factories
  [ ] src/factories/makeIngestionHandler.ts
  [ ] src/factories/makeTerminationHandler.ts
  [ ] src/factories/makeDispatcherWorker.ts

Fase 9 — Entrypoints (thin layers)
  [ ] src/functions/employeeIngestion.ts
  [ ] src/functions/immediateTermination.ts
  [ ] src/workers/dispatcher/main.ts

Fase 10 — Modo Local / Demo (Mocks in-memory)
  [ ] src/providers/inmemory/InMemoryQueueProvider.ts
  [ ] src/providers/inmemory/InMemorySecretProvider.ts
  [ ] src/providers/inmemory/StubSaaSClient.ts
  [ ] src/repositories/inmemory/InMemorySyncStateRepository.ts
  [ ] src/factories/makeLocalDispatcherWorker.ts
  [ ] src/workers/dispatcher/main.local.ts

Fase 11 — Testes
  [ ] tests/unit/services/idempotencyService.test.ts
  [ ] tests/unit/services/dispatcherService.test.ts
  [ ] tests/unit/services/xmlProcessingService.test.ts
  [ ] tests/unit/providers/SaaSHttpClient.test.ts
  [ ] tests/unit/utils/circuitBreaker.test.ts
  [ ] tests/integration/dispatcher/dispatcher.test.ts
  [ ] tests/integration/ingestion/ingestion.test.ts
```

---

## Variáveis de Ambiente Esperadas

```env
SAAS_RATE_LIMIT_PER_SECOND=100
SAAS_MAX_RETRY_ATTEMPTS=3
SAAS_BACKOFF_BASE_MS=200
PROCESSING_LOCK_TIMEOUT_SECONDS=240
SECRETS_CACHE_TTL_SECONDS=300
CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS=30
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
SQS_WAIT_TIME_SECONDS=20
EMPLOYEE_TERMINATION_QUEUE_URL=
EMPLOYEE_UPSERT_QUEUE_URL=
DYNAMO_TABLE_NAME=EmployeeSyncState
SAAS_SECRET_NAME=saas-integration-credentials
```
