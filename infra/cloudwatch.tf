# cloudwatch.tf
# Alarmes operacionais (ARCH §21). O log group do dispatcher fica em ecs.tf
# (colado à task). Aqui ficam o tópico de alerta e os três alarmes exigidos:
# mensagens em DLQ, circuit breaker aberto em excesso e taxa de falha do SaaS.

# Destino das notificações dos alarmes. Subscriptions (e-mail/Slack/etc.) são
# adicionadas por ambiente, fora deste código (PoC declarativa).
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"

  tags = merge(local.common_tags, {
    Component = "observability"
  })
}

# Mapa das 3 DLQs para gerar um alarme por fila sem repetição (§18/§21).
locals {
  dlq_queue_names = {
    termination = aws_sqs_queue.termination_dlq.name
    upsert      = aws_sqs_queue.upsert_dlq.name
    ingestion   = aws_sqs_queue.ingestion_dlq.name
  }
}

# (1) Qualquer mensagem visível em uma DLQ dispara alarme: indica evento que
# esgotou as tentativas e precisa de análise (§21).
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  for_each = local.dlq_queue_names

  alarm_name          = "${each.value}-messages-visible"
  alarm_description   = "Mensagens presentes na DLQ ${each.value} (§21)."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = each.value }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching" # sem dados = sem mensagens = OK
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = merge(local.common_tags, {
    Component = "observability"
  })
}

# (2) Aberturas EXCESSIVAS do circuit breaker em janela curta (§15/§21).
# Métrica customizada emitida pelo dispatcher (§20).
resource "aws_cloudwatch_metric_alarm" "circuit_breaker_open" {
  alarm_name          = "${local.name_prefix}-circuit-breaker-open"
  alarm_description   = "Aberturas excessivas do circuit breaker em 5 min (§21)."
  namespace           = local.metrics_namespace
  metric_name         = "circuit_breaker_open_total"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 3 # tunável: 3+ aberturas em 5 min = instabilidade sustentada
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  tags = merge(local.common_tags, {
    Component = "observability"
  })
}

# (3) Taxa de falha anormal do SaaS (§21): metric-math failed/total em %.
# Mais correto que contagem bruta — independe do volume.
resource "aws_cloudwatch_metric_alarm" "saas_failure_rate" {
  alarm_name          = "${local.name_prefix}-saas-failure-rate"
  alarm_description   = "Taxa de falha do SaaS acima de 20% em 5 min (§21)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 20 # %
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "failure_rate"
    expression  = "100 * failed / total"
    label       = "SaaSFailureRatePct"
    return_data = true
  }

  metric_query {
    id = "failed"
    metric {
      metric_name = "saas_requests_failed"
      namespace   = local.metrics_namespace
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "total"
    metric {
      metric_name = "saas_requests_total"
      namespace   = local.metrics_namespace
      period      = 300
      stat        = "Sum"
    }
  }

  tags = merge(local.common_tags, {
    Component = "observability"
  })
}
