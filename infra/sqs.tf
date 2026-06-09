# sqs.tf
# Filas SQS Standard (ARCH §17) e suas DLQs (§18). Duas filas principais convergem
# para o dispatcher; cada fluxo tem sua própria DLQ após maxReceiveCount tentativas.
#
# Coordenação §14: visibility (240) x maxReceiveCount (5) = 1200 > lock (240),
# garantindo recuperação de eventos órfãos antes do envio à DLQ. (Ver check em locals.tf.)

# Conta/região para montar ARNs de forma estável, sem criar ciclo entre
# fila principal (redrive_policy -> DLQ) e DLQ (redrive_allow_policy -> fila).
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ===========================================================================
# Dead Letter Queues (§18)
# ===========================================================================

# DLQ do fluxo de demissões.
resource "aws_sqs_queue" "termination_dlq" {
  name                      = local.termination_dlq_name
  message_retention_seconds = 1209600 # 14 dias para análise/reprocessamento
  sqs_managed_sse_enabled   = true    # criptografia em repouso (SSE-SQS, sem KMS)

  # Só a fila principal de demissões pode fazer redrive para esta DLQ.
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [local.termination_queue_arn]
  })

  tags = merge(local.common_tags, {
    Component = "termination"
    Role      = "dlq"
  })
}

# DLQ do fluxo batch (upserts).
resource "aws_sqs_queue" "upsert_dlq" {
  name                      = local.upsert_dlq_name
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [local.upsert_queue_arn]
  })

  tags = merge(local.common_tags, {
    Component = "upsert"
    Role      = "dlq"
  })
}

# DLQ da ingestão de arquivos (§5/§18): recebe falhas de parse do XML enviadas
# DIRETAMENTE pela Lambda (destino on-failure, lado Serverless) — nenhuma fila SQS
# faz redrive para cá. Por isso redrivePermission = denyAll.
resource "aws_sqs_queue" "ingestion_dlq" {
  name                      = local.ingestion_dlq_name
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  redrive_allow_policy = jsonencode({
    redrivePermission = "denyAll"
  })

  tags = merge(local.common_tags, {
    Component = "ingestion-batch"
    Role      = "dlq"
  })
}

# ===========================================================================
# Filas principais (§17)
# ===========================================================================

# Fila prioritária de demissões (§6, §8).
resource "aws_sqs_queue" "termination" {
  name                       = local.termination_queue_name
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds # §14
  receive_wait_time_seconds  = var.sqs_wait_time_seconds          # long polling (§8)
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.termination_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count # §18
  })

  tags = merge(local.common_tags, {
    Component = "termination"
    Role      = "main"
  })
}

# Fila batch de inclusões/alterações (§5, §8).
resource "aws_sqs_queue" "upsert" {
  name                       = local.upsert_queue_name
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
  receive_wait_time_seconds  = var.sqs_wait_time_seconds
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.upsert_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = merge(local.common_tags, {
    Component = "upsert"
    Role      = "main"
  })
}
