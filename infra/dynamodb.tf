# dynamodb.tf
# Tabela única de estado operacional + idempotência (ARCH §9).
# Zero-Read Pattern (§10): a idempotência é garantida por escrita condicional,
# não por TTL. Por isso NÃO há `ttl` sobre lockExpiresAt (§13 é explícito: o campo
# controla posse de processamento, não expiração de dados).

resource "aws_dynamodb_table" "employee_sync_state" {
  name         = local.dynamo_table_name
  billing_mode = "PAY_PER_REQUEST" # §23: alta escrita, sem capacity planning

  hash_key  = "employeeId" # §9 Partition Key
  range_key = "eventHash"  # §9 Sort Key (SHA-256 do payload normalizado)

  attribute {
    name = "employeeId"
    type = "S"
  }

  attribute {
    name = "eventHash"
    type = "S"
  }

  # Os demais atributos (flow, status, lockExpiresAt, createdAt, updatedAt) são
  # schemaless no DynamoDB: só PK/SK precisam ser declarados. Não há índice
  # secundário — o acesso é sempre por (employeeId, eventHash) via Zero-Read (§10).

  # NÃO declarar `ttl`: lockExpiresAt não é mecanismo de expiração de dados (§13).

  # Proteção de dados do estado operacional (idempotência é crítica). PITR tem
  # custo modesto de backup contínuo, justificado por ser fonte de verdade do
  # processamento.
  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Component = "sync-state"
  })
}
