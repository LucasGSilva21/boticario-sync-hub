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
npm test               # testes unitários
npm run test:coverage  # cobertura (meta: 100%)
npm run lint           # ESLint
npm run typecheck      # checagem de tipos (sem emitir)
```

---

## 📖 Documentação Técnica (Fontes da Verdade)

Para entender a fundo as decisões de design e as regras de escrita de código, consulte a nossa pasta `/docs`:

1. **[Arquitetura da Solução](/docs/ARCHITECTURE.md):** Contém o desenho macro da topologia AWS, justificativas das escolhas dos componentes, tratamento de falhas (*Circuit Breaker*), idempotência (*Zero-Read Pattern*) e gerenciamento de custos.
2. **[Guia de Desenvolvimento](/docs/DEVELOPMENT_GUIDE.md):** Define a arquitetura de pastas do backend, responsabilidade das camadas (Services, Providers, Repositories), padrões de logs e comportamento dos testes unitários.

---

## 🛡️ Premissas da PoC
Por se tratar de um desafio técnico em formato de PoC:
* O Dashboard utiliza dados estáticos estruturados locais para fins de demonstração visual.
* O provisionamento real de recursos na AWS não é necessário; as definições de infraestrutura estão descritas de forma declarativa na pasta `/infra`.
