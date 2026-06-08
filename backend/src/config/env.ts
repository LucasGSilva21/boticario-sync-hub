// Único ponto de acesso a process.env em todo o backend.
// Valida e congela todas as variáveis no boot (fail-fast): se algo faltar
// ou for inválido, a aplicação não sobe.

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireNumberEnv(key: string): number {
  const raw = requireEnv(key);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Environment variable ${key} must be a positive integer, got: "${raw}"`,
    );
  }
  return parsed;
}

export const env = {
  saasRateLimitPerSecond: requireNumberEnv('SAAS_RATE_LIMIT_PER_SECOND'),
  saasMaxRetryAttempts: requireNumberEnv('SAAS_MAX_RETRY_ATTEMPTS'),
  saasBackoffBaseMs: requireNumberEnv('SAAS_BACKOFF_BASE_MS'),
  processingLockTimeoutSeconds: requireNumberEnv(
    'PROCESSING_LOCK_TIMEOUT_SECONDS',
  ),
  secretsCacheTtlSeconds: requireNumberEnv('SECRETS_CACHE_TTL_SECONDS'),
  circuitBreakerResetTimeoutSeconds: requireNumberEnv(
    'CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS',
  ),
  employeeTerminationQueueUrl: requireEnv('EMPLOYEE_TERMINATION_QUEUE_URL'),
  employeeUpsertQueueUrl: requireEnv('EMPLOYEE_UPSERT_QUEUE_URL'),
  dynamoTableName: requireEnv('DYNAMO_TABLE_NAME'),
  saasSecretName: requireEnv('SAAS_SECRET_NAME'),
} as const;

export type Env = typeof env;
