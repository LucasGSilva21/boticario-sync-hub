# outputs.tf
# Saídas para inspeção (CLI/humanos) e eventual consumo por outras ferramentas.
# Não expõe segredos: apenas o ARN do secret (identificador), nunca seu valor.

# --- S3 ---
output "batch_bucket_name" {
  description = "Nome do bucket de ingestão batch (§5)."
  value       = aws_s3_bucket.batch_files.id
}

output "batch_bucket_arn" {
  description = "ARN do bucket de ingestão batch."
  value       = aws_s3_bucket.batch_files.arn
}

# --- SQS (filas principais + DLQs) ---
output "termination_queue_url" {
  description = "URL da fila prioritária de demissões (§8)."
  value       = aws_sqs_queue.termination.url
}

output "upsert_queue_url" {
  description = "URL da fila batch de upserts (§8)."
  value       = aws_sqs_queue.upsert.url
}

output "queue_arns" {
  description = "ARNs de todas as filas (principais e DLQs)."
  value = {
    termination     = aws_sqs_queue.termination.arn
    upsert          = aws_sqs_queue.upsert.arn
    termination_dlq = aws_sqs_queue.termination_dlq.arn
    upsert_dlq      = aws_sqs_queue.upsert_dlq.arn
    ingestion_dlq   = aws_sqs_queue.ingestion_dlq.arn
  }
}

# --- DynamoDB ---
output "sync_state_table_name" {
  description = "Nome da tabela de estado/idempotência (§9)."
  value       = aws_dynamodb_table.employee_sync_state.name
}

output "sync_state_table_arn" {
  description = "ARN da tabela de estado/idempotência."
  value       = aws_dynamodb_table.employee_sync_state.arn
}

# --- Secrets Manager (apenas o identificador, nunca o valor) ---
output "saas_secret_arn" {
  description = "ARN do secret de credenciais do SaaS (§16). O valor é gerido fora do Terraform."
  value       = aws_secretsmanager_secret.saas_credentials.arn
}

# --- ECS (dispatcher) ---
output "ecs_cluster_name" {
  description = "Cluster Fargate do dispatcher (§8)."
  value       = aws_ecs_cluster.main.name
}

output "dispatcher_service_name" {
  description = "Serviço ECS do dispatcher (desired_count = 1)."
  value       = aws_ecs_service.dispatcher.name
}

output "dispatcher_task_definition_arn" {
  description = "ARN da task definition do dispatcher."
  value       = aws_ecs_task_definition.dispatcher.arn
}

output "dispatcher_task_role_arn" {
  description = "ARN da task role (identidade do código do dispatcher, §22)."
  value       = aws_iam_role.dispatcher_task.arn
}

# --- Observabilidade ---
output "alerts_topic_arn" {
  description = "SNS de destino dos alarmes (§21). Subscriptions adicionadas por ambiente."
  value       = aws_sns_topic.alerts.arn
}

# --- Ponte Serverless (SSM) ---
output "serverless_bridge_ssm_parameters" {
  description = "Nomes dos SSM params consumidos pelo serverless.yml (Terraform -> Serverless)."
  value       = [for p in aws_ssm_parameter.serverless_bridge : p.name]
}
