export type LogFields = Record<string, unknown>;

export interface ILogger {
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}
