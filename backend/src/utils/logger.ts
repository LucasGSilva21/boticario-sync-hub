import type { ILogger, LogFields } from './interfaces/ILogger';

type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, fields: LogFields): void {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  console.log(JSON.stringify(entry));
}

export const logger: ILogger = {
  info(fields: LogFields): void {
    write('info', fields);
  },
  warn(fields: LogFields): void {
    write('warn', fields);
  },
  error(fields: LogFields): void {
    write('error', fields);
  },
};
