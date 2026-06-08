import { sleep } from './sleep';

export interface BackoffOptions {
  maxAttempts: number;
  baseMs: number;
  shouldRetry?: (error: unknown) => boolean;
  random?: () => number;
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
  } = options;

  const run = async (attempt: number): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      await sleep(baseMs * 2 ** (attempt - 1) + random() * baseMs);
      return run(attempt + 1);
    }
  };

  return run(1);
}
