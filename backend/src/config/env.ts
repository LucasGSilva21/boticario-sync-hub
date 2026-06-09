// src/config/env.ts
// Único ponto de acesso a process.env. Validação LAZY (getters): cada variável é
// lida/validada apenas quando acessada, não no carregamento do módulo. Assim cada
// entrypoint exige somente o subconjunto que realmente usa — a Lambda de ingestão
// não precisa das credenciais/tunables do dispatcher, e vice-versa.

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
  get saasRateLimitPerSecond(): number {
    return requireNumberEnv('SAAS_RATE_LIMIT_PER_SECOND');
  },
  get saasMaxRetryAttempts(): number {
    return requireNumberEnv('SAAS_MAX_RETRY_ATTEMPTS');
  },
  get saasBackoffBaseMs(): number {
    return requireNumberEnv('SAAS_BACKOFF_BASE_MS');
  },
  get processingLockTimeoutSeconds(): number {
    return requireNumberEnv('PROCESSING_LOCK_TIMEOUT_SECONDS');
  },
  get secretsCacheTtlSeconds(): number {
    return requireNumberEnv('SECRETS_CACHE_TTL_SECONDS');
  },
  get circuitBreakerResetTimeoutSeconds(): number {
    return requireNumberEnv('CIRCUIT_BREAKER_RESET_TIMEOUT_SECONDS');
  },
  get circuitBreakerFailureThreshold(): number {
    return requireNumberEnv('CIRCUIT_BREAKER_FAILURE_THRESHOLD');
  },
  get sqsWaitTimeSeconds(): number {
    return requireNumberEnv('SQS_WAIT_TIME_SECONDS');
  },
  get employeeTerminationQueueUrl(): string {
    return requireEnv('EMPLOYEE_TERMINATION_QUEUE_URL');
  },
  get employeeUpsertQueueUrl(): string {
    return requireEnv('EMPLOYEE_UPSERT_QUEUE_URL');
  },
  get dynamoTableName(): string {
    return requireEnv('DYNAMO_TABLE_NAME');
  },
  get saasSecretName(): string {
    return requireEnv('SAAS_SECRET_NAME');
  },
} as const;

export type Env = typeof env;
