import { logger } from '../../../src/utils/logger';

describe('logger', () => {
  const FIXED_ISO = '2026-06-08T12:00:00.000Z';
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(FIXED_ISO));
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['info', 'warn', 'error'] as const)(
    'emits a single JSON line with level "%s" and ISO timestamp',
    (method) => {
      logger[method]({ employeeId: '123', flow: 'UPSERT', status: 'SUCCESS' });
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify({
          level: method,
          timestamp: FIXED_ISO,
          employeeId: '123',
          flow: 'UPSERT',
          status: 'SUCCESS',
        }),
      );
    },
  );
});
