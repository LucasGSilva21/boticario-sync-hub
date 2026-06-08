import { sleep } from '../../../src/utils/sleep';

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves only after the specified delay', async () => {
    const resolved = jest.fn();
    const promise = sleep(1000).then(resolved);
    await jest.advanceTimersByTimeAsync(999);
    expect(resolved).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it('schedules setTimeout with the given ms', () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    void sleep(250);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);
  });
});
