# infra — Terraform (recursos long-lived)

Infraestrutura **declarativa** do `boticario-sync-hub` (ARCHITECTURE.md §2): a
topologia AWS é representada em código e validada com `terraform fmt`/`validate`,
**sem `terraform apply` real**. Não há backend remoto de estado.

## Fronteira Serverless ↔ Terraform

A infra é dividida de forma intencional entre as duas ferramentas, **sem duplicar
recursos**:

| Recurso | Dono | Observação |
|---|---|---|
| SQS (2 filas + 3 DLQs) | **Terraform** | `sqs.tf` — `maxReceiveCount=5`, visibility coordenado com o lock (§14) |
| DynamoDB `EmployeeSyncState` | **Terraform** | `dynamodb.tf` — `PAY_PER_REQUEST`, sem TTL (§13) |
| Bucket `employee-sync-batch-files` | **Terraform** | `s3.tf` — só o bucket; **sem** `aws_s3_bucket_notification` |
| Secret `saas-integration-credentials` | **Terraform** | `secrets.tf` — só o cofre; valor populado fora do TF |
| ECS Fargate (cluster/task/service) | **Terraform** | `ecs.tf` — `desired_count=1` (§8) |
| IAM do dispatcher | **Terraform** | `iam.tf` — task role + execution role |
| Alarmes CloudWatch + SNS | **Terraform** | `cloudwatch.tf` (§21) |
| Parâmetros SSM (ponte) | **Terraform** | `ssm.tf` — identificadores p/ o Serverless ler |
| Código das 2 Lambdas | **Serverless** | `backend/serverless.yml` |
| API Gateway `POST /api/v1/terminations` | **Serverless** | `httpApi` |
| Trigger `s3:ObjectCreated` → Lambda | **Serverless** | `existing: true` (bucket é do Terraform) |
| IAM das 2 Lambdas | **Serverless** | colada às funções que a assumem |

### Por que assim

- **IAM mora junto da compute** que a assume (ownership claro): dispatcher no
  Terraform; Lambdas no Serverless.
- **Notificação S3 só no Serverless** (`existing: true`): se o Terraform também
  declarasse `aws_s3_bucket_notification`, as duas ferramentas brigariam (drift).
- **Terraform é a fonte única** dos identificadores (URLs/ARNs/nomes). O ECS recebe
  os valores direto na task definition; o Serverless os lê via **SSM Parameter
  Store** (`ssm.tf`) — sem hardcode, sem recriar recurso.

## Ponte Terraform → Serverless (SSM)

O `ssm.tf` publica em `/${project}/${stage}/...` o que as Lambdas precisam. No
`serverless.yml`, consome-se assim:

```yaml
provider:
  environment:
    EMPLOYEE_UPSERT_QUEUE_URL: ${ssm:/boticario-sync-hub/${sls:stage}/sqs/upsert-queue-url}
```

Parâmetros publicados: URLs/ARNs das filas `upsert`/`termination`, ARN da
`ingestion-dlq`, e nome/ARN do bucket. Credenciais **não** passam por aqui — ficam
só no Secrets Manager.

## Estrutura

```
infra/
├── versions.tf       # required_version + provider aws ~> 5
├── providers.tf      # provider AWS (região + default_tags)
├── variables.tf      # entradas (defaults da tabela do CLAUDE.md)
├── locals.tf         # nomes canônicos, tags, invariante SQS §14 (check)
├── s3.tf             # bucket de ingestão (sem notification)
├── sqs.tf            # filas + DLQs (redrive, SSE, long polling)
├── dynamodb.tf       # tabela de estado/idempotência
├── secrets.tf        # cofre do secret do SaaS
├── iam.tf            # roles do dispatcher (menor privilégio §22)
├── ecs.tf            # cluster + task def + service (desired_count=1) + log group
├── cloudwatch.tf     # SNS + 3 alarmes (§21)
├── ssm.tf            # ponte de identificadores p/ o Serverless
├── outputs.tf        # ARNs/URLs/names p/ inspeção
└── terraform.tfvars.example
```

## Validação local

```bash
cd infra
terraform init -backend=false   # baixa o provider, sem estado remoto
terraform fmt -check             # formatação
terraform validate               # consistência da configuração
```

> O `check "sqs_lock_coordination"` (em `locals.tf`) materializa a regra §14
> (`lock < visibility × maxReceiveCount`); é avaliado em `plan`/`apply`.

## Premissas (PoC)

- Sem provisionamento real (§2): nenhum `apply` contra AWS de verdade.
- Rede do dispatcher (subnets/SGs) entra por variável — não há VPC neste módulo.
- Valor do secret e subscriptions do SNS são definidos por ambiente, fora do código.
