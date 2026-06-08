# DEVELOPMENT_GUIDE.md

## Objetivo

Define as diretrizes de implementação do projeto `boticario-sync-hub`. Garante consistência entre as camadas do backend e serve como referência para geração de código por ferramentas de IA e desenvolvimento manual.

**Em caso de conflito, `ARCHITECTURE.md` tem prioridade absoluta.**

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js LTS |
| Linguagem | TypeScript (strict mode) |
| Testes | Jest |
| Lambdas | Serverless Framework + serverless-plugin-typescript |
| Worker (ECS) | Executado via script `package.json` |
| Infra Serverless | Serverless Framework |
| Infra Long-Lived | Terraform |

### Restrições Críticas

- **Proibido:** Express, NestJS, Fastify, Hapi ou qualquer framework web.
- **Proibido:** Frameworks de injeção de dependência (Inversify, TSyringe etc.). DI é feita manualmente via Factories.
- **Obrigatório:** AWS SDK v3 (`@aws-sdk/client-*`). Nunca usar v2.

---

## Estrutura do Monorepo

```
/boticario-sync-hub
├── /backend
├── /frontend
├── /infra
└── /docs
```

---

## Estrutura do Backend (`/backend/src`)

```
src/
├── config/               # Variáveis de ambiente (único ponto de acesso ao process.env)
│   └── env.ts
│
├── types/                # DTOs, enums e eventos de domínio compartilhados
│   ├── employee.types.ts
│   └── sync-state.types.ts
│
├── functions/            # Entrypoints das AWS Lambdas (handlers finos)
│   ├── employeeIngestion.ts
│   └── immediateTermination.ts
│
├── workers/              # Entrypoints do ECS Fargate (main finos)
│   └── dispatcher/
│       ├── main.ts
│       └── main.local.ts # entrypoint da demo local (mocks in-memory)
│
├── services/             # Regras de negócio (dependem apenas de interfaces)
│   ├── xmlProcessingService.ts
│   ├── dispatcherService.ts
│   └── idempotencyService.ts
│
├── providers/            # Implementações de I/O externo (AWS SDK, HTTP)
│   ├── interfaces/
│   │   ├── IBucketProvider.ts
│   │   ├── IQueueProvider.ts
│   │   ├── ISecretProvider.ts
│   │   ├── ISaaSClient.ts
│   │   └── IXmlParser.ts
│   ├── S3BucketProvider.ts
│   ├── SqsQueueProvider.ts
│   ├── SecretsManagerSecretProvider.ts
│   ├── SaaSHttpClient.ts
│   ├── SaxXmlParser.ts
│   └── inmemory/          # Implementações in-memory para a demo local
│       ├── InMemoryQueueProvider.ts
│       ├── InMemorySecretProvider.ts
│       └── StubSaaSClient.ts
│
├── repositories/         # Camada de persistência (DynamoDB)
│   ├── interfaces/
│   │   └── ISyncStateRepository.ts
│   ├── DynamoSyncStateRepository.ts
│   └── inmemory/
│       └── InMemorySyncStateRepository.ts
│
├── factories/            # Montagem e injeção de dependências (um por entrypoint)
│   ├── makeIngestionHandler.ts
│   ├── makeTerminationHandler.ts
│   ├── makeDispatcherWorker.ts
│   └── makeLocalDispatcherWorker.ts # injeta mocks in-memory (demo)
│
└── utils/                # Utilitários transversais sem regra de negócio
    ├── interfaces/
    │   └── ILogger.ts    # contrato de logging injetado nos Services
    ├── logger.ts
    ├── hashGenerator.ts
    ├── sleep.ts
    └── backoff.ts        # retry com backoff exponencial + jitter
```

---

## Responsabilidades por Camada

### `config/`

**Único local permitido para acessar `process.env`.**

Valida e exporta todas as variáveis de ambiente em tempo de inicialização. Qualquer variável ausente deve lançar erro imediatamente, antes da aplicação subir.

```typescript
// src/config/env.ts
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  saasRateLimitPerSecond: parseInt(requireEnv('SAAS_RATE_LIMIT_PER_SECOND'), 10),
  saasMaxRetryAttempts: parseInt(requireEnv('SAAS_MAX_RETRY_ATTEMPTS'), 10),
  saasBackoffBaseMs: parseInt(requireEnv('SAAS_BACKOFF_BASE_MS'), 10),
  processingLockTimeoutSeconds: parseInt(requireEnv('PROCESSING_LOCK_TIMEOUT_SECONDS'), 10),
  secretsCacheTtlSeconds: parseInt(requireEnv('SECRETS_CACHE_TTL_SECONDS'), 10),
  circuitBreakerResetTimeoutSeconds: parseInt(requireEnv('CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS'), 10),
  circuitBreakerFailureThreshold: parseInt(requireEnv('CIRCUIT_BREAKER_FAILURE_THRESHOLD'), 10),
  sqsWaitTimeSeconds: parseInt(requireEnv('SQS_WAIT_TIME_SECONDS'), 10),
  employeeTerminationQueueUrl: requireEnv('EMPLOYEE_TERMINATION_QUEUE_URL'),
  employeeUpsertQueueUrl: requireEnv('EMPLOYEE_UPSERT_QUEUE_URL'),
  dynamoTableName: requireEnv('DYNAMO_TABLE_NAME'),
  saasSecretName: requireEnv('SAAS_SECRET_NAME'),
} as const;
```

**Regra:** Nenhum outro arquivo importa `process.env` diretamente. Todos importam de `config/env.ts`.

---

### `types/`

DTOs, enums e tipos de eventos de domínio compartilhados entre camadas.

Não contém lógica de execução — apenas assinaturas de tipos.

```typescript
// Exemplos de tipos centralizados aqui:
// EmployeeUpsertEvent, TerminationEvent, ProcessingStatus, FlowType, SyncState
```

---

### `functions/` — Entrypoints das Lambdas

Arquivo fino que exporta o handler AWS. Não contém regra de negócio.

Responsabilidades:
1. Chamar o Factory correspondente para montar a árvore de dependências.
2. Extrair os dados do evento AWS e delegar para o Service.
3. Tratar erros e retornar a resposta correta ao API Gateway (quando aplicável).

```typescript
// src/functions/immediateTermination.ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { makeTerminationHandler } from '../factories/makeTerminationHandler';

const service = makeTerminationHandler(); // instanciado fora do handler (warm start)

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  return service.handle(event);
};
```

```typescript
// src/functions/employeeIngestion.ts
import type { S3Event } from 'aws-lambda';
import { makeIngestionHandler } from '../factories/makeIngestionHandler';

const service = makeIngestionHandler();

export const handler = async (event: S3Event): Promise<void> => {
  await service.handle(event);
};
```

**Referência no `serverless.yml`:**
```yaml
functions:
  employeeIngestion:
    handler: src/functions/employeeIngestion.handler
  immediateTermination:
    handler: src/functions/immediateTermination.handler
```

---

### `workers/dispatcher/main.ts` — Entrypoint do Worker

Arquivo fino que inicializa o worker do ECS Fargate. Não contém regra de negócio.

Responsabilidades:
1. Chamar o Factory correspondente.
2. Chamar `worker.start()`.

```typescript
// src/workers/dispatcher/main.ts
import { makeDispatcherWorker } from '../../factories/makeDispatcherWorker';

void (async (): Promise<void> => {
  const worker = makeDispatcherWorker();
  await worker.start();
})();
```

**Script no `package.json`:**
```json
{
  "scripts": {
    "start:dispatcher": "ts-node src/workers/dispatcher/main.ts",
    "start:local": "ts-node src/workers/dispatcher/main.local.ts"
  }
}
```

---

### `services/` — Regras de Negócio

Implementam a lógica central de negócio. São **totalmente agnósticos a infraestrutura**.

Regras:
- Recebem dependências **exclusivamente via interfaces** no construtor.
- Não importam nenhuma implementação concreta de Provider ou Repository.
- Não acessam `process.env` diretamente — recebem configurações via construtor se necessário.

```typescript
// Exemplo de assinatura correta
class DispatcherService {
  constructor(
    private readonly idempotency: IIdempotencyService,
    private readonly saasClient: ISaaSClient,
    private readonly logger: ILogger,
  ) {}
}
```

---

### `providers/` — Comunicação Externa e I/O

Encapsulam toda comunicação com AWS SDK, HTTP e bibliotecas externas.

Regras:
- Cada Provider implementa uma interface com **nome de domínio** (sem referência à tecnologia).
- A interface vive em `providers/interfaces/`.
- A implementação concreta fica diretamente em `providers/`.

#### Tabela de Mapeamento Interface → Implementação

| Interface | Implementação Concreta | Tecnologia Subjacente |
|---|---|---|
| `IBucketProvider` | `S3BucketProvider` | AWS S3 SDK v3 |
| `IQueueProvider` | `SqsQueueProvider` | AWS SQS SDK v3 |
| `ISecretProvider` | `SecretsManagerSecretProvider` | AWS Secrets Manager SDK v3 |
| `ISaaSClient` | `SaaSHttpClient` | `fetch` nativo + `bottleneck` |
| `IXmlParser` | `SaxXmlParser` | `saxes` (SAX evented streaming) |

#### Exemplo de interface (sem nome de tecnologia)

```typescript
// src/providers/interfaces/IQueueProvider.ts
export interface IQueueMessage {
  body: string;
  receiptHandle: string;
}

export interface IQueueProvider {
  receiveMessages(queueUrl: string, maxMessages: number): Promise<IQueueMessage[]>;
  sendMessage(queueUrl: string, body: string): Promise<void>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
}
```

---

### `repositories/` — Persistência

Abstraem toda interação com DynamoDB. Nenhum Service acessa o DynamoDB diretamente.

```typescript
// src/repositories/interfaces/ISyncStateRepository.ts
import type { FlowType } from '../../types/employee.types';

export type AcquireResult =
  | { acquired: true }
  | { acquired: false; reason: 'ALREADY_COMPLETED' | 'LOCK_ACTIVE' };

export interface ISyncStateRepository {
  /**
   * Tenta registrar o evento como PROCESSING via Conditional Write (Zero-Read Pattern).
   * Retorna false se o evento já estiver COMPLETED ou PROCESSING com lock válido.
   */
  tryAcquireProcessing(employeeId: string, eventHash: string, flow: FlowType, lockExpiresAt: Date): Promise<AcquireResult>;

  markCompleted(employeeId: string, eventHash: string): Promise<void>;

  markFailed(employeeId: string, eventHash: string): Promise<void>;
}
```

**Regra:** `tryAcquireProcessing` jamais deve realizar um `GetItem` antes do `PutItem`/`UpdateItem`. A validação de duplicidade ocorre integralmente via operação condicional do DynamoDB (Zero-Read Pattern).

---

### `factories/` — Montagem de Dependências

São os **únicos arquivos que importam implementações concretas** de Providers e Repositories.

Cada entrypoint possui exatamente um Factory. O Factory constrói e injeta toda a árvore de dependências.

```typescript
// src/factories/makeDispatcherWorker.ts
import { env } from '../config/env';
import { DispatcherWorker } from '../workers/dispatcher/DispatcherWorker';
import { DispatcherService } from '../services/dispatcherService';
import { IdempotencyService } from '../services/idempotencyService';
import { SqsQueueProvider } from '../providers/SqsQueueProvider';
import { SaaSHttpClient } from '../providers/SaaSHttpClient';
import { SecretsManagerSecretProvider } from '../providers/SecretsManagerSecretProvider';
import { DynamoSyncStateRepository } from '../repositories/DynamoSyncStateRepository';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

export function makeDispatcherWorker(): DispatcherWorker {
  const secretProvider = new SecretsManagerSecretProvider(env.secretsCacheTtlSeconds);
  const queueProvider = new SqsQueueProvider(env.sqsWaitTimeSeconds);
  const syncStateRepo = new DynamoSyncStateRepository(env.dynamoTableName);
  const circuitBreaker = new CircuitBreaker(
    env.circuitBreakerResetTimeoutSeconds,
    env.circuitBreakerFailureThreshold,
  );

  const saasClient = new SaaSHttpClient(secretProvider, circuitBreaker, env.saasRateLimitPerSecond);
  const idempotencyService = new IdempotencyService(syncStateRepo, env.processingLockTimeoutSeconds);
  const dispatcherService = new DispatcherService(idempotencyService, saasClient, logger);

  return new DispatcherWorker(dispatcherService, queueProvider, circuitBreaker, {
    terminationQueueUrl: env.employeeTerminationQueueUrl,
    upsertQueueUrl: env.employeeUpsertQueueUrl,
  });
}
```

---

### `utils/` — Utilitários Transversais

Código utilitário puramente técnico sem regra de negócio.

| Utilitário | Responsabilidade |
|---|---|
| `logger.ts` | Log estruturado em JSON para stdout (CloudWatch) |
| `hashGenerator.ts` | Gera SHA-256 do payload normalizado do evento |
| `sleep.ts` | `Promise`-based `setTimeout` para pausas assíncronas |
| `backoff.ts` | Retry com backoff exponencial + jitter; respeita o Circuit Breaker (não retenta quando `OPEN`) |
| `circuitBreaker.ts` | Implementação dos estados Closed / Open / Half-Open |

---

## Regras de Implementação Críticas

### 1. Controle de Vazão (Rate Limit)

Implementado exclusivamente em `SaaSHttpClient` via `bottleneck`.

```
configuração: SAAS_RATE_LIMIT_PER_SECOND=100
```

Nenhuma outra camada conhece ou aplica rate limit.

---

### 2. Circuit Breaker

- Instância criada no Factory e injetada em `SaaSHttpClient` (registra falhas/sucessos) **e** em `DispatcherWorker` (controla o polling).
- Quando `OPEN`: Worker aplica `sleep` de `CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS` antes de reiniciar o ciclo. Nenhum polling ocorre.
- Mensagens em-voo quando o circuito abre: rejeitadas sem ACK, retornam à fila pelo Visibility Timeout.

---

### 3. Retentativa com Backoff Exponencial

Política de retentativa **em camadas** (atende ao requisito de "retentativa inteligente"):

1. **Backoff exponencial com jitter** no `SaaSHttpClient` (via `utils/backoff.ts`) para falhas transitórias do parceiro (`5xx` / timeout): até `SAAS_MAX_RETRY_ATTEMPTS` tentativas, com espera `SAAS_BACKOFF_BASE_MS * 2^(n-1)` + jitter aleatório.
2. **Circuit Breaker** para instabilidade sustentada: se o circuito estiver `OPEN`, o cliente lança `CircuitOpenError` **imediatamente, sem backoff** — não amplifica carga sobre um parceiro já caído. Cada falha/sucesso alimenta o Circuit Breaker.
3. **SQS redrive + Visibility Timeout**: esgotadas as tentativas in-process, o registro vira `FAILED` e a mensagem retorna nativamente à fila.
4. **DLQ**: após `maxReceiveCount`, a mensagem segue para a DLQ do fluxo.

**Regra:** o backoff in-process deve ser curto (poucas tentativas) para não segurar o lock (`lockExpiresAt`) nem o slot de rate limit. A soma do backoff deve ser muito menor que `PROCESSING_LOCK_TIMEOUT_SECONDS`.

---

### 4. Priorização de Filas no Worker

A cada ciclo do loop:

1. Tentar consumir de `employee-termination-queue`.
2. **Somente se retornar vazio**, tentar `employee-upsert-queue`.
3. Se ambas retornarem vazias, aplicar `sleep` de 5 segundos antes do próximo ciclo.

```typescript
// Pseudocódigo do loop principal
while (true) {
  if (circuitBreaker.isOpen()) {
    await sleep(env.circuitBreakerResetTimeoutSeconds * 1000);
    continue;
  }

  const terminations = await queueProvider.receiveMessages(terminationQueueUrl, 10);
  if (terminations.length > 0) {
    await processMessages(terminations);
    continue;
  }

  const upserts = await queueProvider.receiveMessages(upsertQueueUrl, 10);
  if (upserts.length > 0) {
    await processMessages(upserts);
    continue;
  }

  await sleep(5_000); // filas vazias
}
```

---

### 5. Idempotência (Zero-Read Pattern)

- **Proibido `GetItem`** antes de verificar duplicidade.
- A operação `tryAcquireProcessing` usa `ConditionExpression` no DynamoDB.
- Máquina de estados:

| Estado atual | `lockExpiresAt` | Ação |
|---|---|---|
| Registro inexistente | — | Criar como `PROCESSING` ✅ |
| `PROCESSING` | ainda válido | Bloquear ❌ |
| `PROCESSING` | expirado (órfão) | Permitir recuperação ✅ |
| `FAILED` | — | Permitir reprocessamento ✅ |
| `COMPLETED` | — | Descartar ❌ |

---

### 6. Parsing de XML em Stream

- Biblioteca: `saxes` — parser SAX **evented/streaming real** (JS puro, tipos nativos).
- O `Body` do `GetObjectCommand` (S3 SDK v3) é um `Readable` consumido **incrementalmente** pelo `saxes`.
- O arquivo S3 **não deve ser carregado integralmente em memória**.
- Cada colaborador é montado a partir dos eventos SAX (`opentag` / `text` / `closetag`) e, ao fechar `</employee>`, imediatamente publicado no SQS como evento individual.
- Complexidade de memória: O(1) — independente do tamanho do arquivo.
- **Proibido `fast-xml-parser` na ingestão:** ele desserializa o documento inteiro em memória (não é SAX/stream) e inviabiliza lotes grandes.

---

### 7. Logs Estruturados

Todos os logs vão para `stdout` em JSON (capturado pelo CloudWatch).

```typescript
// Sucesso
logger.info({ timestamp, employeeId, flow: 'UPSERT', status: 'SUCCESS' });

// Erro
logger.error({ timestamp, employeeId, flow: 'TERMINATION', status: 'ERROR', error: 'Partner API timeout' });
```

Campos mínimos obrigatórios: `timestamp`, `employeeId`, `flow`, `status`.

---

## TypeScript — Diretrizes de Configuração

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

Regras de escrita:

- **Proibido `any`.** Use `unknown` para tipos dinâmicos.
- **Proibido `process.env` fora de `src/config/env.ts`.**
- Declare explicitamente o tipo de retorno em todas as funções e handlers.
- Prefira `type` para DTOs e `interface` para contratos injetáveis (Providers, Repositories, Services).

---

## Testes

- Framework: Jest + `ts-jest`.
- Mocks implementam as interfaces (`IBucketProvider`, `IQueueProvider` etc.) para total isolamento.
- Mocks para Circuit Breaker e Bottleneck expõem métodos de controle de estado determinístico (ex: `forceOpen()`, `forceFailure(n)`). **Proibido comportamento probabilístico em testes**.
- Estrutura de diretórios espelha `src/`:

```
tests/
├── unit/
│   ├── services/
│   ├── providers/
│   └── repositories/
└── integration/
    ├── dispatcher/
    └── ingestion/
```

---

## Modo Local / Demo (Mocks)

O desafio exige rodar a solução localmente em minutos, **sem LocalStack/Docker e sem AWS real** ("use Mocks/Stubs"). A DI por interfaces viabiliza isso trocando apenas os Providers concretos por implementações in-memory — a lógica de negócio exercitada na demo é idêntica à de produção.

- **Entrypoint:** `src/workers/dispatcher/main.local.ts` (script `npm run start:local`).
- **Factory:** `makeLocalDispatcherWorker()` injeta as implementações in-memory no **mesmo** `DispatcherService` / `DispatcherWorker` de produção.
- **Sem `env.ts`:** a factory local usa defaults de demonstração (não exige variáveis de ambiente) — `start:local` roda zero-config.

| Interface | Impl. de produção | Impl. local (demo) |
|---|---|---|
| `IQueueProvider` | `SqsQueueProvider` | `InMemoryQueueProvider` (filas em arrays, pré-carregadas com eventos de exemplo) |
| `ISecretProvider` | `SecretsManagerSecretProvider` | `InMemorySecretProvider` (credenciais fixas de demo) |
| `ISaaSClient` | `SaaSHttpClient` | `StubSaaSClient` (simula `2xx`/`5xx`/latência para exercitar backoff e Circuit Breaker) |
| `ISyncStateRepository` | `DynamoSyncStateRepository` | `InMemorySyncStateRepository` (`Map` em memória, preserva idempotência) |

O `StubSaaSClient` deve permitir respostas **determinísticas** (ex.: falhar N vezes e depois suceder) para demonstrar retry/backoff e abertura do circuito sem aleatoriedade não-controlada (alinhado à regra de testes determinísticos).

---

## Frontend (Dashboard)

- Stack: React + Vite + TypeScript + Tailwind CSS.
- Escopo: tela única, demonstrativo.
- **Nenhuma chamada HTTP real.** Todos os dados vêm de `/frontend/src/mocks/`.
