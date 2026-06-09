import { sleep } from './sleep';

export interface BackoffRetryInfo {
  attempt: number;
  nextDelayMs: number;
  error: unknown;
}

export interface BackoffOptions {
  maxAttempts: number;
  baseMs: number;
  shouldRetry?: (error: unknown) => boolean;
  random?: () => number;
  onRetry?: (info: BackoffRetryInfo) => void;
}

export async function withBackoff<T>(
  operation: () => Promise<T>,
  options: BackoffOptions,
): Promise<T> {
  const {
    maxAttempts,
    baseMs,
    shouldRetry = () => true,
    random = Math.random,
    onRetry,
  } = options;

  const run = async (attempt: number): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const nextDelayMs = baseMs * 2 ** (attempt - 1) + random() * baseMs;
      onRetry?.({ attempt, nextDelayMs, error });
      await sleep(nextDelayMs);
      return run(attempt + 1);
    }
  };

  return run(1);
}
