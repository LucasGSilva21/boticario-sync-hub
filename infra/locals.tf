# locals.tf
# Valores derivados e nomes canônicos. Os nomes de recursos são FIXADOS pela
# ARCHITECTURE.md (não são parametrizáveis): mantê-los aqui como constantes evita
# divergência entre arquivos. Também centraliza as tags comuns e expressa a
# invariante de coordenação SQS da §14 como um `check` (avaliado em plan-time).

locals {
  # Prefixo lógico para nomes não-canônicos (cluster, log groups, SSM).
  name_prefix = "${var.project}-${var.stage}"

  # Caminho-base dos parâmetros SSM que servem de ponte Terraform -> Serverless.
  ssm_prefix = "/${var.project}/${var.stage}"

  # Tags aplicadas a todos os recursos (mescladas via provider default_tags).
  common_tags = merge(
    {
      Project   = var.project
      Stage     = var.stage
      ManagedBy = "terraform"
    },
    var.tags,
  )

  # ---------------------------------------------------------------------------
  # Nomes canônicos fixados pela ARCH (§5, §9, §16, §17-18)
  # ---------------------------------------------------------------------------
  bucket_name = "employee-sync-batch-files" # §5

  termination_queue_name = "employee-termination-queue" # §18 (prioritária)
  upsert_queue_name      = "employee-upsert-queue"      # §18 (batch)

  termination_dlq_name = "employee-termination-dlq" # §18
  upsert_dlq_name      = "employee-upsert-dlq"      # §18
  ingestion_dlq_name   = "employee-ingestion-dlq"   # §18 (falha de parse do XML)

  dynamo_table_name = "EmployeeSyncState"            # §9
  secret_name       = "saas-integration-credentials" # §16

  # Nomes operacionais do dispatcher (ECS) e observabilidade.
  ecs_cluster_name      = "${local.name_prefix}-cluster"
  dispatcher_service    = "saas-integration-dispatcher" # §8
  dispatcher_log_group  = "/ecs/${local.name_prefix}/saas-integration-dispatcher"
  dispatcher_task_label = "${local.name_prefix}-dispatcher"

  # Limite superior da janela de recuperação antes da DLQ (§14).
  # lock deve ser MENOR que visibility x maxReceiveCount para que eventos presos
  # em PROCESSING sejam recuperáveis antes de irem para a DLQ.
  sqs_recovery_window_seconds = var.sqs_visibility_timeout_seconds * var.sqs_max_receive_count

  # ARNs construídos das filas principais (evitam ciclo fila<->DLQ no redrive).
  # data.aws_caller_identity / data.aws_region são declarados em sqs.tf.
  termination_queue_arn = "arn:aws:sqs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.termination_queue_name}"
  upsert_queue_arn      = "arn:aws:sqs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.upsert_queue_name}"

  # Namespace das métricas customizadas do dispatcher (§20). Contrato com o app:
  # o dispatcher publica saas_requests_*, circuit_breaker_open_total etc. aqui.
  metrics_namespace = "BoticarioSyncHub"
}

# Invariante da §14 expressa como check (avaliada em plan-time; não bloqueia
# `validate`, mas falha o plan se alguém quebrar a coordenação lock/visibility).
check "sqs_lock_coordination" {
  assert {
    condition     = var.processing_lock_timeout_seconds < local.sqs_recovery_window_seconds
    error_message = "PROCESSING_LOCK_TIMEOUT_SECONDS (${var.processing_lock_timeout_seconds}) deve ser menor que visibility (${var.sqs_visibility_timeout_seconds}) x maxReceiveCount (${var.sqs_max_receive_count}) = ${local.sqs_recovery_window_seconds} (ARCH §14)."
  }
}
