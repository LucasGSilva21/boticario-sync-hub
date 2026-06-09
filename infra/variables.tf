# variables.tf
# Entradas parametrizáveis da infra. Os defaults refletem a tabela de variáveis de
# ambiente do CLAUDE.md e alimentam dois consumidores: (1) o bloco `environment` da
# task definition do ECS (dispatcher) e (2) os `aws_ssm_parameter` que servem de ponte
# para o Serverless ler URLs/ARNs/nomes. Nenhuma credencial real mora aqui.

# ---------------------------------------------------------------------------
# Identidade / tags
# ---------------------------------------------------------------------------

variable "project" {
  description = "Nome do projeto, usado em prefixos de nomes e tags."
  type        = string
  default     = "boticario-sync-hub"
}

variable "stage" {
  description = "Ambiente lógico (espelha o stage do Serverless Framework)."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "Região AWS alvo (espelha o default do backend/serverless.yml)."
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Tags adicionais aplicadas a todos os recursos (mescladas às tags base)."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# SQS — coordenação de visibilidade/redrive (ARCH §14, §18)
# ---------------------------------------------------------------------------

variable "sqs_max_receive_count" {
  description = "Tentativas antes da DLQ (ARCH §18). Componente da regra lock < visibility x maxReceiveCount."
  type        = number
  default     = 5
}

variable "sqs_visibility_timeout_seconds" {
  description = "Visibility timeout das filas principais. Igual ao lock (240) garante lock < visibility x maxReceiveCount (ARCH §14)."
  type        = number
  default     = 240
}

# ---------------------------------------------------------------------------
# Parâmetros operacionais do Dispatcher (CLAUDE.md) — viram env da task ECS
# ---------------------------------------------------------------------------

variable "saas_rate_limit_per_second" {
  description = "Limite global de vazão ao SaaS (ARCH §8)."
  type        = number
  default     = 100
}

variable "saas_max_retry_attempts" {
  description = "Tentativas de backoff in-process no SaaSHttpClient (ARCH §15)."
  type        = number
  default     = 3
}

variable "saas_backoff_base_ms" {
  description = "Base do backoff exponencial em ms (ARCH §15)."
  type        = number
  default     = 200
}

variable "processing_lock_timeout_seconds" {
  description = "Tempo máximo de posse do processamento / lockExpiresAt (ARCH §13-14)."
  type        = number
  default     = 240
}

variable "secrets_cache_ttl_seconds" {
  description = "TTL do cache local de credenciais do SaaS (ARCH §16)."
  type        = number
  default     = 300
}

variable "circuit_breaker_reset_timeout_seconds" {
  description = "Tempo até o circuito tentar half-open (ARCH §15)."
  type        = number
  default     = 30
}

variable "circuit_breaker_failure_threshold" {
  description = "Falhas consecutivas que abrem o circuito (ARCH §15)."
  type        = number
  default     = 5
}

variable "sqs_wait_time_seconds" {
  description = "Long polling do consumo SQS pelo dispatcher (ARCH §8)."
  type        = number
  default     = 20
}

# ---------------------------------------------------------------------------
# Dispatcher (ECS Fargate) — dimensionamento e imagem
# ---------------------------------------------------------------------------

variable "dispatcher_cpu" {
  description = "CPU da task Fargate do dispatcher (unidades; 256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "dispatcher_memory" {
  description = "Memória (MiB) da task Fargate do dispatcher."
  type        = number
  default     = 512
}

variable "dispatcher_image" {
  description = "Imagem do container do dispatcher (placeholder na PoC; build real via Dockerfile futuro)."
  type        = string
  default     = "boticario-sync-hub/saas-integration-dispatcher:latest"
}

variable "dispatcher_subnet_ids" {
  description = "Subnets onde a task Fargate do dispatcher roda (entrada por ambiente; PoC sem VPC própria)."
  type        = list(string)
  default     = []
}

variable "dispatcher_security_group_ids" {
  description = "Security groups da task Fargate do dispatcher."
  type        = list(string)
  default     = []
}

variable "dispatcher_assign_public_ip" {
  description = "Atribui IP público à task (true se rodar em subnet pública sem NAT)."
  type        = bool
  default     = false
}
