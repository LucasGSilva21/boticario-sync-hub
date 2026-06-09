# ecs.tf
# Dispatcher SaaSIntegrationDispatcher em ECS Fargate (ARCH §8).
# Instância ÚNICA e intencional (desired_count = 1) para centralizar o controle
# global de vazão de 100 req/s. Rodar 2 tasks dobraria o limite — por isso a
# política de deploy também impede sobreposição (ver aws_ecs_service abaixo).

# Log group do dispatcher (destino do driver awslogs). Logs estruturados §19.
resource "aws_cloudwatch_log_group" "dispatcher" {
  name              = local.dispatcher_log_group
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Component = "dispatcher"
  })
}

# Cluster Fargate. Container Insights fica OFF (custo, §23): a observabilidade
# vem de logs estruturados (§19) + alarmes (§21), não de métricas de cluster.
resource "aws_ecs_cluster" "main" {
  name = local.ecs_cluster_name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = merge(local.common_tags, {
    Component = "dispatcher"
  })
}

# Task definition do dispatcher. As env vars espelham a tabela do CLAUDE.md e
# injetam os identificadores criados pelo Terraform (URLs de fila, nome da tabela,
# nome do secret). O secret NÃO é injetado como container-secret: o app o lê em
# runtime via task role, com cache/TTL (§16).
resource "aws_ecs_task_definition" "dispatcher" {
  family                   = local.dispatcher_task_label
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.dispatcher_cpu)
  memory                   = tostring(var.dispatcher_memory)
  execution_role_arn       = aws_iam_role.dispatcher_execution.arn
  task_role_arn            = aws_iam_role.dispatcher_task.arn

  container_definitions = jsonencode([
    {
      name      = local.dispatcher_service
      image     = var.dispatcher_image
      essential = true

      # Drain gracioso (§15): tempo para terminar mensagens in-flight ao receber
      # SIGTERM antes do kill. 120s é o máximo do Fargate.
      stopTimeout = 120

      environment = [
        # Tunables operacionais (CLAUDE.md)
        { name = "SAAS_RATE_LIMIT_PER_SECOND", value = tostring(var.saas_rate_limit_per_second) },
        { name = "SAAS_MAX_RETRY_ATTEMPTS", value = tostring(var.saas_max_retry_attempts) },
        { name = "SAAS_BACKOFF_BASE_MS", value = tostring(var.saas_backoff_base_ms) },
        { name = "PROCESSING_LOCK_TIMEOUT_SECONDS", value = tostring(var.processing_lock_timeout_seconds) },
        { name = "SECRETS_CACHE_TTL_SECONDS", value = tostring(var.secrets_cache_ttl_seconds) },
        { name = "CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS", value = tostring(var.circuit_breaker_reset_timeout_seconds) },
        { name = "CIRCUIT_BREAKER_FAILURE_THRESHOLD", value = tostring(var.circuit_breaker_failure_threshold) },
        { name = "SQS_WAIT_TIME_SECONDS", value = tostring(var.sqs_wait_time_seconds) },

        # Identificadores resolvidos pelo Terraform (fonte única)
        { name = "EMPLOYEE_TERMINATION_QUEUE_URL", value = aws_sqs_queue.termination.url },
        { name = "EMPLOYEE_UPSERT_QUEUE_URL", value = aws_sqs_queue.upsert.url },
        { name = "DYNAMO_TABLE_NAME", value = local.dynamo_table_name },
        { name = "SAAS_SECRET_NAME", value = local.secret_name },

        # Região para o AWS SDK v3 (Fargate não injeta automaticamente).
        { name = "AWS_REGION", value = data.aws_region.current.name },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.dispatcher.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "dispatcher"
        }
      }
    }
  ])

  tags = merge(local.common_tags, {
    Component = "dispatcher"
  })
}

# Serviço que mantém exatamente 1 task viva (§8).
resource "aws_ecs_service" "dispatcher" {
  name            = local.dispatcher_service
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.dispatcher.arn
  launch_type     = "FARGATE"

  # INVARIANTE §8: exatamente uma instância. Não transformar em variável.
  desired_count = 1

  # Impede sobreposição durante deploy: derruba a task antiga ANTES de subir a
  # nova (0% mínimo / 100% máximo). Garante que nunca existam 2 dispatchers
  # competindo pelo limite global de vazão.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = var.dispatcher_subnet_ids
    security_groups  = var.dispatcher_security_group_ids
    assign_public_ip = var.dispatcher_assign_public_ip
  }

  tags = merge(local.common_tags, {
    Component = "dispatcher"
  })
}
