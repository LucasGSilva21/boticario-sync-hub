# boticario-sync-hub

O **boticario-sync-hub** é uma plataforma de integração robusta e de alta resiliência projetada para sincronizar dados de colaboradores entre um ERP interno e uma plataforma parceira (SaaS) via API REST, respeitando um limite estrito de vazão (*rate limit*) de 100 requisições por segundo.

Esta solução foi desenvolvida como uma Prova de Conceito (PoC) arquitetada sobre a nuvem da AWS, utilizando padrões assíncronos e mensageria para garantir a entrega confiável e ordenada por prioridade de eventos de negócio.

---

## 📂 Estrutura do Monorepo

O projeto está organizado em um único repositório para facilitar a governança, compartilhamento de tipos e deploy:

```text
/boticario-sync-hub
├── /backend     -> Código-fonte das AWS Lambdas (Ingestão) e Worker ECS Fargate (Dispatcher)
├── /frontend    -> Dashboard demonstrativo em React + Vite para monitoramento operacional
├── /infra       -> Arquivos de provisionamento (Serverless Framework e Terraform)
└── /docs        -> Documentação técnica e decisões arquiteturais
```

---

## 🛠️ Stack Tecnológica Principal

* **Backend:** Node.js (LTS), TypeScript (Strict Mode)
* **Frontend:** React, Vite, Tailwind CSS
* **Testes:** Jest
* **Infraestrutura:** Serverless Framework, Terraform
* **Mensageria & Dados (AWS):** SQS, DynamoDB, S3, Secrets Manager

---

## 🚀 Rodando a Demo Local (Backend)

A PoC roda **100% localmente, sem AWS, LocalStack ou Docker**. Toda a infraestrutura externa (SQS, DynamoDB, Secrets Manager e a própria API do SaaS) é substituída por **mocks/stubs in-memory**. A lógica de negócio exercitada é exatamente a mesma de produção — apenas a camada de I/O é trocada via injeção de dependências.

### Pré-requisitos
* Node.js LTS (testado em Node 24)

### Passos

```bash
cd backend
npm install
npm run start:local
```

A demo (`runLocalDemo`) executa uma sequência de **cenários narrados** que comprovam os requisitos de resiliência do desafio, emitindo logs estruturados em JSON e um resumo consolidado ao final:

1. **Priorização + Retry/Backoff** — demissões são processadas antes de upserts; uma chamada que falha com `503` é reenviada com *exponential backoff* (log por tentativa) e recupera.
2. **Volume + Rate Limit** — um lote de 30 upserts é cadenciado a 100 req/s (via `bottleneck`), sem estourar `429`.
3. **Falha Definitiva → DLQ** — o SaaS responde sempre `503`; após esgotar os retries e o `maxReceiveCount`, a mensagem seria encaminhada à *Dead Letter Queue*.
4. **Circuit Breaker** — 5 falhas consecutivas abrem o circuito; após o tempo de reset ele passa a *half-open* e, com sucesso, retorna a *closed*.
5. **Idempotência (Zero-Read)** — o reenvio do mesmo evento é descartado (`ALREADY_COMPLETED`), sem nova chamada ao SaaS.

> Os totais do resumo final (Sucessos / Erros / Retentativas / Idempotência) seguem o mesmo formato dos dados exibidos no Dashboard do frontend.

### O que está mockado

| Dependência real (produção) | Substituto local (demo) |
|---|---|
| Amazon SQS | Filas in-memory (`InMemoryQueueProvider`) |
| AWS Secrets Manager | Credenciais fixas (`InMemorySecretProvider`) |
| Amazon DynamoDB | Estado e idempotência em `Map` (`InMemorySyncStateRepository`) |
| API do SaaS | `SaaSHttpClient` **real** com `fetch` stubado (`createStubSaaSFetch`) |

> Na demo, o `SaaSHttpClient` **não é substituído** — apenas o `fetch` nativo é stubado. Dessa forma, backoff, rate limit e Circuit Breaker são exercitados de verdade, sem rede.

### Outros comandos úteis

```bash
npm test               # todos os testes (unit + integração)
npm run test:coverage  # cobertura (meta: 100%)
npm run lint           # ESLint
npm run typecheck      # checagem de tipos (sem emitir)
```

---

## 🖥️ Rodando o Dashboard (Frontend)

Dashboard demonstrativo de observabilidade em **React + Vite + Tailwind**, tela
única e **100% com dados mockados** (sem AWS, sem backend, sem rede). Os
totalizadores e métricas espelham a execução real da demo do backend.

### Pré-requisitos
* Node.js LTS

### Passos

```bash
cd frontend
npm install
npm run dev
```

Abra a URL exibida pelo Vite (por padrão `http://localhost:5173`).

O dashboard exibe:
* **Totalizadores** — Sucessos / Erros / Retentativas / Idempotência (formato do `printSummary`).
* **Métricas operacionais** (ARCH §20) com nomes canônicos.
* **Circuit Breaker** (Closed / Open / Half-Open) e **profundidade das filas** (termination prioritária vs. upsert).
* **Eventos recentes** no formato de log estruturado (ARCH §19).

### Outros comandos úteis

```bash
npm test               # testes (Vitest + Testing Library)
npm run test:coverage  # cobertura (100% em lib/ e hooks/; ~90% global)
npm run build          # typecheck + build de produção
npm run lint           # ESLint
npm run typecheck      # checagem de tipos (sem emitir)
```

> Os dados vêm de `frontend/src/mocks/` e foram capturados da execução real de
> `npm run start:local` (backend), mantendo os números coerentes entre demo e dashboard.

---

## 🧪 Testes

A suíte cobre 100% da lógica de negócio e separa os testes por **tipo**, identificado pelo sufixo do arquivo:

| Sufixo | Tipo | O que exercita |
|---|---|---|
| `*.test.ts` | **Unitário** | Uma unidade isolada, com dependências mockadas via interfaces. |
| `*.spec.ts` | **Integração** | A árvore real (Services + Worker) montada na suíte, com Providers/Repositories **in-memory** — sem mocks da lógica de negócio. Determinismo via injeção de relógio/`fetch`/`sleep`. |

```text
backend/tests/
├── unit/          -> *.test.ts  (services, providers, repositories, utils…)
└── integration/   -> *.spec.ts  (dispatcher, ingestion — fluxo ponta a ponta)
```

A partir de `backend/`:

```bash
npm test                   # todos os testes (unit + integração)
npm run test:unit          # apenas unitários  (*.test.ts)
npm run test:integration   # apenas integração (*.spec.ts)
npm run test:coverage      # todos, com relatório de cobertura (meta: 100%)
npm run test:watch         # modo watch
```

Os testes de integração comprovam, com a lógica de produção e providers in-memory, os mesmos requisitos da demo: priorização de filas, idempotência (*Zero-Read*), retry/backoff, falha definitiva, *Circuit Breaker* (Open → Half-Open → Closed) e recuperação de eventos órfãos (`lockExpiresAt`), além da ingestão de XML válido e o tratamento de XML inválido/malformado.

---

## 🏗️ Infraestrutura (AWS)

A infraestrutura é **declarativa** (ARCH §2): representada em código e validada com
`terraform validate` — **sem provisionamento real** nesta PoC. Ela é dividida entre
duas ferramentas, de forma intencional e **sem duplicar recursos**:

* **Terraform (`/infra`)** — recursos *long-lived*: filas SQS + DLQs, tabela
  DynamoDB, bucket S3, secret do Secrets Manager, cluster/serviço ECS Fargate do
  dispatcher (`desired_count = 1`), IAM do dispatcher, alarmes CloudWatch e os
  parâmetros SSM que servem de ponte.
* **Serverless Framework (`backend/serverless.yml`)** — *código* das Lambdas e seus
  event sources: o trigger `s3:ObjectCreated` (ingestão), o API Gateway
  `POST /api/v1/terminations` (demissão) e o IAM de menor privilégio de cada função.

**Ponte sem drift:** o Terraform é a *fonte única* dos identificadores
(URLs/ARNs/nomes) e os publica no **SSM Parameter Store**; o `serverless.yml` os
consome via `${ssm:...}`. Nenhum recurso é recriado entre as duas ferramentas.

O dispatcher roda em container (ECS Fargate): veja [`backend/Dockerfile`](/backend/Dockerfile)
(multi-stage, Node 24). O CI (`.github/workflows/ci.yml`) roda lint + typecheck +
testes de backend e frontend e a validação do Terraform — **acionamento manual**
(`workflow_dispatch`) por se tratar de uma PoC.

> Detalhes da topologia, da fronteira Serverless ↔ Terraform e dos comandos de
> validação estão em **[`/infra/README.md`](/infra/README.md)**.

---

## 📖 Documentação Técnica (Fontes da Verdade)

Para entender a fundo as decisões de design e as regras de escrita de código, consulte a nossa pasta `/docs`:

1. **[Arquitetura da Solução](/docs/ARCHITECTURE.md):** Contém o desenho macro da topologia AWS, justificativas das escolhas dos componentes, tratamento de falhas (*Circuit Breaker*), idempotência (*Zero-Read Pattern*) e gerenciamento de custos.
2. **[Guia de Desenvolvimento](/docs/DEVELOPMENT_GUIDE.md):** Define a arquitetura de pastas do backend, responsabilidade das camadas (Services, Providers, Repositories), padrões de logs e a convenção de testes (unitários `*.test.ts` vs. integração `*.spec.ts`).

---

## 🛡️ Premissas da PoC
Por se tratar de um desafio técnico em formato de PoC:
* O Dashboard utiliza dados estáticos estruturados locais para fins de demonstração visual.
* O provisionamento real de recursos na AWS não é necessário; as definições de infraestrutura estão descritas de forma declarativa na pasta `/infra`.
