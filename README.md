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

## 🛠️ Stack Tecnológica Utama

* **Backend:** Node.js (LTS), TypeScript (Strict Mode)
* **Frontend:** React, Vite, Tailwind CSS
* **Testes:** Jest
* **Infraestrutura:** Serverless Framework, Terraform
* **Mensageria & Dados (AWS):** SQS, DynamoDB, S3, Secrets Manager

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
