# DEVELOPMENT_GUIDE.md

# Objetivo

Este documento define as diretrizes de implementação do projeto `boticario-sync-hub`.

Seu objetivo é garantir consistência entre backend, frontend e infraestrutura, reduzindo ambiguidades durante a geração de código por ferramentas de IA (GitHub Copilot) e durante o desenvolvimento manual.

Todas as implementações devem respeitar as definições descritas em:
```text
/docs/ARCHITECTURE.md
```
Em caso de conflito entre documentos, o **`ARCHITECTURE.md` possui prioridade absoluta.**

---

# Stack Tecnológica

## Backend
* **Runtime:** Node.js (Versão LTS)
* **Linguagem:** TypeScript (Modo Estrito / Strict Mode)

### Restrições Críticas do Backend
* **Não utilizar Express, NestJS, Fastify ou Hapi.**
* **Não utilizar frameworks de Injeção de Dependência** (Inversão de dependência deve ser feita manualmente via construtores e Factories).
* **Priorizar APIs nativas do Node.js** (Roteamento HTTP da Lambda de Demissões é resolvido nativamente via API Gateway + Serverless Framework).

---

## Frontend
* **Framework/Bundler:** React + Vite
* **Linguagem:** TypeScript
* **Estilização:** Tailwind CSS

---

## Testes
* **Framework:** Jest

---

## Infraestrutura
* **Serverless Framework:** Responsável por provisionar recursos Serverless (Lambda Functions, API Gateway, SQS, S3, DynamoDB).
* **Terraform:** Responsável por provisionar infraestrutura corporativa/long-lived (ECS Fargate, IAM Roles, Networking/VPC).

---

# Estrutura do Monorepo

```text
/boticario-sync-hub
├── /backend
├── /frontend
├── /infra
└── /docs
```

---

# Backend

## Estrutura de Diretórios (`/backend`)

```text
/backend
│
├── src
│   ├── types
│   ├── functions
│   ├── workers
│   ├── services
│   ├── providers
│   ├── repositories
│   ├── factories
│   └── utils
│
├── tests
│   ├── unit
│   │   ├── services
│   │   └── providers
│   │
│   └── integration
│       ├── dispatcher
│       └── ingestion
│
├── package.json
├── tsconfig.json
└── jest.config.ts
```

---

## Camadas do Sistema e Responsabilidades

### 1. Types
* **Responsabilidade:** Centralizar DTOs, interfaces, enums e tipos compartilhados (`EmployeeDto`, `TerminationDto`, `EmployeeEvent`, `ProcessingStatus`, `FlowType`).
* **Regra:** Não deve conter nenhuma lógica de execução, apenas assinaturas de tipos.

### 2. Functions
* **Responsabilidade:** Pontos de entrada (*handlers*) das AWS Lambdas (`EmployeeIngestionService`, `ImmediateTerminationService`).
* **Regra:** Contém apenas o código de acoplamento com o runtime da AWS (bootstrap). Não devem conter regras de negócio. Devem invocar os respectivos *Services*.

### 3. Workers
* **Responsabilidade:** Ponto de entrada do processo contínuo no ECS Fargate (`SaaSIntegrationDispatcher`).
* **Regra:** Gerencia o loop infinito de consumo do SQS (`while(true)`). Não concentra regras de negócio. Invoca os *Services* apropriados e gerencia o ritmo do polling com base no estado de saúde do sistema.

### 4. Services
* **Responsabilidade:** Implementar o núcleo das regras de negócio e fluxos coordenados (`IdempotencyService`, `DispatcherService`, `XmlProcessingService`).
* **Regra:** Services podem orquestrar *Providers* e *Repositories*, mas devem ser totalmente agnósticos a detalhes de infraestrutura (ex: não sabem como fazer uma chamada HTTP ou query bruta no DynamoDB).

### 5. Providers
* **Responsabilidade:** Encapsular toda e qualquer comunicação externa ou IO com APIs, SDKs e serviços AWS (`SaaSProvider`, `SecretsManagerProvider`, `SqsProvider`, `XmlParserProvider`).
* **Regra:** Toda biblioteca externa ou chamada de rede deve ficar restrita a um Provider.

### 6. Repositories
* **Responsabilidade:** Abstrair a camada de persistência de dados.
* **Regra:** Nenhum *Service* acessa o DynamoDB diretamente. Toda persistência do estado de sincronização deve ocorrer chamando métodos do `EmployeeSyncStateRepository`.

### 7. Factories
* **Responsabilidade:** Construção centralizada de instâncias e amarração de dependências (`makeDispatcherService()`, `makeSaaSProvider()`).
* **Regra:** Garante a inversão de dependência manual sem frameworks, facilitando a substituição por mocks nos testes.

### 8. Utils
* **Responsabilidade:** Códigos utilitários transversais puramente técnicos (`Logger` estruturado, `HashGenerator`, `DateProvider`). Não contêm regras de negócio.

---

# Regras de Implementação Críticas

## 1. Controle de Vazão (Rate Limit do SaaS)
* O controle estrito de **100 requisições por segundo** deve ser implementado no `SaaSProvider` utilizando a biblioteca **`bottleneck`**.
* Configuração via variável de ambiente: `SAAS_RATE_LIMIT_PER_SECOND=100`.

## 2. Circuit Breaker e Gestão do Loop do Worker
* O Circuit Breaker deve gerenciar os estados `Closed`, `Open` e `Half-Open`.
* **Acoplamento de Resiliência:** A instância do Circuit Breaker deve ser criada de forma global (via Factory) e compartilhada/injetada tanto no `SaaSProvider` (para registrar as falhas/sucessos) quanto no Worker (`SaaSIntegrationDispatcher`).
* **Gerenciamento do Polling (Sem Busy-Wait):** O Worker executará em um loop contínuo nativo. Para preservar recursos de CPU e evitar chamadas desnecessárias à AWS:
    * Se o Circuit Breaker estiver no estado **`OPEN`**, o Worker deve suspender o polling do SQS aplicando um `sleep` assíncrono nativo (via `Promise` + `setTimeout`) equivalente ao tempo de `CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS`.
    * Se o SQS retornar um lote vazio (sem mensagens nas duas filas), o loop deve aplicar um `sleep` de 5 segundos antes de tentar um novo `ReceiveMessage`.

## 3. Priorização de Filas no Worker
* Como o SQS Standard não possui priorização nativa entre filas distintas, o Worker deve fazer a priorização programaticamente:
    * A cada ciclo do loop, o Worker deve tentar consumir primeiro da fila `employee-termination-queue`.
    * Somente se o retorno dessa chamada vier vazio (sem demissões pendentes), o Worker poderá efetuará o polling na fila batch `employee-upsert-queue`.

## 4. Idempotência (Zero-Read Pattern)
* Toda validação de duplicidade e controle de concorrência concorrente deve utilizar **operações condicionais do DynamoDB** através do `EmployeeSyncStateRepository`.
* **Proibido realizar leituras prévias (`GetItem`)** para checar se o registro existe antes de tentar inserir.
* As chaves da tabela `EmployeeSyncState` serão obrigatoriamente: `PK = employeeId` e `SK = eventHash`.
* **Máquina de Estados de Sincronização:**
    * Bloquear e descartar se o status for `COMPLETED`.
    * Bloquear se o status for `PROCESSING` com `lockExpiresAt` válido (concorrência ativa).
    * Permitir reprocessamento se o status for `FAILED` ou se o status for `PROCESSING` com `lockExpiresAt` já expirado (recuperação de evento órfão).

## 5. Parsing de XML de Alta Volumetria
* A leitura de arquivos XML de 30.000 registros na Lambda de ingestão deve utilizar Streams para manter complexidade de memória constante $O(1)$.
* **Biblioteca obrigatória:** `fast-xml-parser`.
* **Justificativa de Mercado:** É a biblioteca padrão do ecossistema Node.js moderno para alta performance e suporte nativo a parsing orientado a eventos (SAX), ideal para ler pedaços do arquivo do S3 e postar no SQS imediatamente sem estourar a memória RAM da Lambda.

## 6. Logs Estruturados
* Toda tentativa de envio ao SaaS deve emitir um log estruturado em formato JSON para o stdout (capturado pelo CloudWatch Logs).
* **Campos mínimos obrigatórios:** `timestamp`, `employeeId`, `flow` (`UPSERT` ou `TERMINATION`) e `status` (`SUCCESS` ou `ERROR`). Logs de erro devem conter o campo descritivo `error`.

---

# Diretrizes para os Testes Unitários e Mocks (Jest)

* **Mocks Determinísticos:** Para testar o comportamento do Circuit Breaker, do Bottleneck e da política de Retry de forma confiável e sem gerar *flaky tests* (testes instáveis), o `MockSaaSProvider` deve expor métodos de controle manual de estado para o ambiente do Jest (ex: método `forceFailure(count, statusCode)`). 
* **Proibido** o uso de falhas baseadas em cálculos probabilísticos ou aleatórios nos testes unitários.

---

# Frontend (Dashboard de Monitoramento)

* **Escopo:** Exclusivamente demonstrativo e em tela única.
* **Restrição:** Nenhuma chamada HTTP real ou comunicação com o backend deve ser implementada.
* Todos os dados exibidos nos Cards de Métricas (Total de Sucessos / Total de Erros) e na tabela de logs devem ser consumidos de uma massa de dados estática estruturada na pasta `/frontend/src/mocks`.

---

# Diretrizes Técnicas de Escrita de Código (Para o Desenvolvedor e Copilot)

* Utilize TypeScript estrito (`strict: true`).
* **Proibido o uso do tipo `any`.** Caso um tipo seja dinâmico ou desconhecido, utilize `unknown`.
* Defina explicitamente os tipos de retorno de todas as funções, métodos e handlers.
* Utilize a versão moderna do **AWS SDK v3** (`@aws-sdk/client-sqs`, `@aws-sdk/client-dynamodb`). Não utilizar a antiga v2.
* Siga o padrão de injeção de dependência via construtor em todas as classes de Service, Repository e Provider.
