# ssm.tf
# Ponte Terraform -> Serverless (fronteira decidida). O Terraform é a FONTE ÚNICA
# dos identificadores dos recursos long-lived; o backend/serverless.yml os consome
# via `${ssm:/...}` para configurar env vars e escopar a IAM das Lambdas — sem
# recriar nenhum recurso (zero duplicação/drift).
#
# Expõe apenas o que as DUAS Lambdas precisam:
#   - ingestão  -> URL da upsert-queue (publica) + ARN p/ IAM; ARN da ingestion-dlq
#                  (destino on-failure) + nome/ARN do bucket (lê o XML).
#   - demissão  -> URL da termination-queue (publica) + ARN p/ IAM.
# O dispatcher (ECS) NÃO lê SSM: recebe tudo direto na task definition.
#
# Exemplo de consumo no serverless.yml:
#   environment:
#     EMPLOYEE_UPSERT_QUEUE_URL: ${ssm:/boticario-sync-hub/${sls:stage}/sqs/upsert-queue-url}

locals {
  serverless_bridge_params = {
    "sqs/upsert-queue-url"      = aws_sqs_queue.upsert.url
    "sqs/upsert-queue-arn"      = aws_sqs_queue.upsert.arn
    "sqs/termination-queue-url" = aws_sqs_queue.termination.url
    "sqs/termination-queue-arn" = aws_sqs_queue.termination.arn
    "sqs/ingestion-dlq-arn"     = aws_sqs_queue.ingestion_dlq.arn
    "s3/batch-bucket-name"      = aws_s3_bucket.batch_files.id
    "s3/batch-bucket-arn"       = aws_s3_bucket.batch_files.arn
  }
}

resource "aws_ssm_parameter" "serverless_bridge" {
  for_each = local.serverless_bridge_params

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "String"
  value = each.value

  tags = merge(local.common_tags, {
    Component = "serverless-bridge"
  })
}
