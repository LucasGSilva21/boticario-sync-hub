import { withBackoff, type BackoffRetryInfo } from '../../../src/utils/backoff';

describe('withBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns immediately on first-attempt success', async () => {
    const op = jest.fn<Promise<string>, []>().mockResolvedValue('ok');
    await expect(
      withBackoff(op, { maxAttempts: 3, baseMs: 100 }),
    ).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries and eventually succeeds (uses default shouldRetry/random)', async () => {
    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('ok');
    const promise = withBackoff(op, { maxAttempts: 3, baseMs: 100 });
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting maxAttempts', async () => {
    const err = new Error('boom');
    const op = jest.fn<Promise<never>, []>().mockRejectedValue(err);
    const promise = withBackoff(op, { maxAttempts: 2, baseMs: 50 });
    const assertion = expect(promise).rejects.toBe(err);
    await jest.runAllTimersAsync();
    await assertion;
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const err = new Error('no-retry');
    const op = jest.fn<Promise<never>, []>().mockRejectedValue(err);
    await expect(
      withBackoff(op, {
        maxAttempts: 3,
        baseMs: 100,
        shouldRetry: () => false,
      }),
    ).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff with deterministic jitter', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce('ok');
    const promise = withBackoff(op, {
      maxAttempts: 3,
      baseMs: 100,
      random: () => 0.5,
    });
    await jest.runAllTimersAsync();
    await promise;
    // 1st retry: 100*2^0 + 0.5*100 = 150 ; 2nd retry: 100*2^1 + 0.5*100 = 250
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 150);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 250);
  });

  it('invokes onRetry before each retry with attempt, delay and error', async () => {
    const err1 = new Error('1');
    const err2 = new Error('2');
    const op = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(err1)
      .mockRejectedValueOnce(err2)
      .mockResolvedValueOnce('ok');
    const onRetry = jest.fn<void, [BackoffRetryInfo]>();
    const promise = withBackoff(op, {
      maxAttempts: 3,
      baseMs: 100,
      random: () => 0.5,
      onRetry,
    });
    await jest.runAllTimersAsync();
    await promise;
    expect(onRetry).toHaveBeenCalledTimes(2);
    // 1st retry: 100*2^0 + 0.5*100 = 150 ; 2nd retry: 100*2^1 + 0.5*100 = 250
    expect(onRetry).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      nextDelayMs: 150,
      error: err1,
    });
    expect(onRetry).toHaveBeenNthCalledWith(2, {
      attempt: 2,
      nextDelayMs: 250,
      error: err2,
    });
  });

  it('does not invoke onRetry for the attempt that exhausts maxAttempts', async () => {
    const op = jest
      .fn<Promise<never>, []>()
      .mockRejectedValue(new Error('boom'));
    const onRetry = jest.fn<void, [BackoffRetryInfo]>();
    const promise = withBackoff(op, { maxAttempts: 2, baseMs: 50, onRetry });
    const assertion = expect(promise).rejects.toThrow('boom');
    await jest.runAllTimersAsync();
    await assertion;
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
