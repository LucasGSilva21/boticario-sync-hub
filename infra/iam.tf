# iam.tf
# IAM de MENOR PRIVILÉGIO do dispatcher (ARCH §22).
#
# FRONTEIRA: aqui ficam SÓ as roles do ECS (dispatcher), pois a compute mora no
# Terraform. As roles das DUAS Lambdas (ingestão: ler S3 + escrever upsert-queue;
# demissão: escrever termination-queue) pertencem ao backend/serverless.yml,
# coladas às funções que as assumem — não são declaradas aqui (evita ownership
# dividido e drift).
#
# Duas roles para o dispatcher, com papéis distintos:
#   - execution role: usada pelo agente do ECS (pull da imagem + driver de logs).
#   - task role:      usada pelo CÓDIGO do dispatcher (SQS + Secrets + DynamoDB).

# Trust policy comum: ambas as roles são assumidas pelo serviço de tasks do ECS.
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ===========================================================================
# Execution role — infraestrutura da task (NÃO é o app)
# ===========================================================================
# Responsável por puxar a imagem e ENVIAR os logs do container ao CloudWatch via
# driver `awslogs`. A managed policy da AWS já concede ECR pull + logs:CreateLogStream
# + logs:PutLogEvents. É por aqui que o requisito "dispatcher escreve logs" (§22) é
# atendido — sem duplicar permissões de log na task role.
resource "aws_iam_role" "dispatcher_execution" {
  name               = "${local.name_prefix}-dispatcher-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = merge(local.common_tags, {
    Component = "dispatcher"
    Role      = "execution"
  })
}

resource "aws_iam_role_policy_attachment" "dispatcher_execution_managed" {
  role       = aws_iam_role.dispatcher_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ===========================================================================
# Task role — identidade do CÓDIGO do dispatcher (§22)
# ===========================================================================
# Permissões mínimas do app: consumir as filas, ler o secret, escrever o estado.
data "aws_iam_policy_document" "dispatcher_task" {
  # Consumo das duas filas principais (§8). Sem SendMessage: o redrive p/ DLQ é
  # automático do SQS, o dispatcher nunca publica.
  statement {
    sid = "ConsumeQueues"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [
      aws_sqs_queue.termination.arn,
      aws_sqs_queue.upsert.arn,
    ]
  }

  # Leitura das credenciais do SaaS (§16). O cache/TTL é no app, não na IAM.
  statement {
    sid       = "ReadSaaSSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.saas_credentials.arn]
  }

  # Escrita do estado/idempotência (§9-10). Zero-Read: só Put/Update condicional,
  # sem GetItem/Query.
  statement {
    sid = "WriteSyncState"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.employee_sync_state.arn]
  }
}

resource "aws_iam_role" "dispatcher_task" {
  name               = "${local.name_prefix}-dispatcher-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = merge(local.common_tags, {
    Component = "dispatcher"
    Role      = "task"
  })
}

resource "aws_iam_role_policy" "dispatcher_task" {
  name   = "${local.name_prefix}-dispatcher-task-policy"
  role   = aws_iam_role.dispatcher_task.id
  policy = data.aws_iam_policy_document.dispatcher_task.json
}
