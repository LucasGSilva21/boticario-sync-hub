import type { APIGatewayProxyEvent } from 'aws-lambda';
import { TerminationController } from '../../../src/controllers/TerminationController';

type MockedService = { terminate: jest.Mock<Promise<void>, [string]> };
type MockedLogger = {
  info: jest.Mock<void, [Record<string, unknown>]>;
  warn: jest.Mock<void, [Record<string, unknown>]>;
  error: jest.Mock<void, [Record<string, unknown>]>;
};

function makeService(): MockedService {
  return { terminate: jest.fn<Promise<void>, [string]>() };
}

function makeLogger(): MockedLogger {
  return {
    info: jest.fn<void, [Record<string, unknown>]>(),
    warn: jest.fn<void, [Record<string, unknown>]>(),
    error: jest.fn<void, [Record<string, unknown>]>(),
  };
}

function apiEvent(body: string | null): APIGatewayProxyEvent {
  return { body } as unknown as APIGatewayProxyEvent;
}

describe('TerminationController', () => {
  it('terminates, logs and returns 202 for a valid payload', async () => {
    const service = makeService();
    const logger = makeLogger();
    const controller = new TerminationController(service, logger);
    const result = await controller.handle(
      apiEvent(JSON.stringify({ employeeId: '12345' })),
    );
    expect(service.terminate).toHaveBeenCalledWith('12345');
    expect(result.statusCode).toBe(202);
    expect(logger.info).toHaveBeenCalledWith({
      employeeId: '12345',
      flow: 'TERMINATION',
      status: 'QUEUED',
    });
  });

  it.each([
    ['a null body', null],
    ['an invalid JSON body', 'not-json'],
    ['a JSON null body', 'null'],
    ['a missing employeeId', '{}'],
    ['a non-string employeeId', '{"employeeId":123}'],
    ['an empty employeeId', '{"employeeId":""}'],
  ])('returns 400 for %s without calling the service', async (_label, body) => {
    const service = makeService();
    const logger = makeLogger();
    const controller = new TerminationController(service, logger);
    const result = await controller.handle(apiEvent(body));
    expect(result.statusCode).toBe(400);
    expect(service.terminate).not.toHaveBeenCalled();
  });

  it('returns 500 and logs the error when the service throws', async () => {
    const service = makeService();
    service.terminate.mockRejectedValue(new Error('sqs down'));
    const logger = makeLogger();
    const controller = new TerminationController(service, logger);
    const result = await controller.handle(
      apiEvent(JSON.stringify({ employeeId: '12345' })),
    );
    expect(result.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith({
      employeeId: '12345',
      flow: 'TERMINATION',
      status: 'ERROR',
      error: 'sqs down',
    });
  });

  it('stringifies non-Error throwables in the 500 error log', async () => {
    const service = makeService();
    service.terminate.mockRejectedValue('weird');
    const logger = makeLogger();
    const controller = new TerminationController(service, logger);
    const result = await controller.handle(
      apiEvent(JSON.stringify({ employeeId: '12345' })),
    );
    expect(result.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith({
      employeeId: '12345',
      flow: 'TERMINATION',
      status: 'ERROR',
      error: 'weird',
    });
  });
});
