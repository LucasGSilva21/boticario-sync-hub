import { Readable } from 'node:stream';
import type { S3Event } from 'aws-lambda';
import { XmlProcessingService } from '../../../src/services/xmlProcessingService';
import type { ParsedEmployee } from '../../../src/providers/interfaces/IXmlParser';

const fixedNow = new Date('2026-06-08T12:00:00.000Z');

async function* toAsyncIterable(
  items: ParsedEmployee[],
): AsyncGenerator<ParsedEmployee> {
  for (const item of items) {
    yield await Promise.resolve(item);
  }
}

function s3Event(key: string): S3Event {
  return {
    Records: [{ s3: { bucket: { name: 'bucket' }, object: { key } } }],
  } as unknown as S3Event;
}

type Deps = {
  bucket: { getObjectStream: jest.Mock<Promise<Readable>, [string, string]> };
  parser: { parse: jest.Mock<AsyncIterable<ParsedEmployee>, [Readable]> };
  queue: {
    receiveMessages: jest.Mock<Promise<never[]>, [string, number]>;
    sendMessage: jest.Mock<Promise<void>, [string, string]>;
    deleteMessage: jest.Mock<Promise<void>, [string, string]>;
  };
  logger: {
    info: jest.Mock<void, [Record<string, unknown>]>;
    warn: jest.Mock<void, [Record<string, unknown>]>;
    error: jest.Mock<void, [Record<string, unknown>]>;
  };
};

function makeDeps(employees: ParsedEmployee[]): Deps {
  const stream = Readable.from('<x/>');
  return {
    bucket: {
      getObjectStream: jest
        .fn<Promise<Readable>, [string, string]>()
        .mockResolvedValue(stream),
    },
    parser: {
      parse: jest
        .fn<AsyncIterable<ParsedEmployee>, [Readable]>()
        .mockReturnValue(toAsyncIterable(employees)),
    },
    queue: {
      receiveMessages: jest.fn<Promise<never[]>, [string, number]>(),
      sendMessage: jest.fn<Promise<void>, [string, string]>(),
      deleteMessage: jest.fn<Promise<void>, [string, string]>(),
    },
    logger: {
      info: jest.fn<void, [Record<string, unknown>]>(),
      warn: jest.fn<void, [Record<string, unknown>]>(),
      error: jest.fn<void, [Record<string, unknown>]>(),
    },
  };
}

describe('XmlProcessingService', () => {
  it('publishes one upsert event per parsed employee and logs the count', async () => {
    const deps = makeDeps([
      {
        employeeId: '1',
        data: { name: 'Ana', department: 'Tech', position: 'Dev' },
      },
      {
        employeeId: '2',
        data: { name: 'Bob', department: 'Sales', position: 'Rep' },
      },
    ]);
    const service = new XmlProcessingService(
      deps.bucket,
      deps.parser,
      deps.queue,
      'upsert-url',
      deps.logger,
      () => fixedNow,
    );
    await service.handle(s3Event('employees%20file.xml'));
    expect(deps.bucket.getObjectStream).toHaveBeenCalledWith(
      'bucket',
      'employees file.xml',
    );
    expect(deps.queue.sendMessage).toHaveBeenNthCalledWith(
      1,
      'upsert-url',
      JSON.stringify({
        employeeId: '1',
        eventType: 'UPSERT',
        eventTimestamp: fixedNow.toISOString(),
        data: { name: 'Ana', department: 'Tech', position: 'Dev' },
      }),
    );
    expect(deps.queue.sendMessage).toHaveBeenNthCalledWith(
      2,
      'upsert-url',
      JSON.stringify({
        employeeId: '2',
        eventType: 'UPSERT',
        eventTimestamp: fixedNow.toISOString(),
        data: { name: 'Bob', department: 'Sales', position: 'Rep' },
      }),
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'UPSERT',
        status: 'INGESTED',
        bucket: 'bucket',
        key: 'employees file.xml',
        count: 2,
      }),
    );
  });

  it('logs a count of zero for an empty file without publishing', async () => {
    const deps = makeDeps([]);
    const service = new XmlProcessingService(
      deps.bucket,
      deps.parser,
      deps.queue,
      'upsert-url',
      deps.logger,
      () => fixedNow,
    );
    await service.handle(s3Event('empty.xml'));
    expect(deps.queue.sendMessage).not.toHaveBeenCalled();
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ count: 0 }),
    );
  });

  it('uses the default clock when none is injected', async () => {
    const deps = makeDeps([
      {
        employeeId: '1',
        data: { name: 'Ana', department: 'Tech', position: 'Dev' },
      },
    ]);
    const service = new XmlProcessingService(
      deps.bucket,
      deps.parser,
      deps.queue,
      'upsert-url',
      deps.logger,
    );
    await service.handle(s3Event('file.xml'));
    expect(deps.queue.sendMessage).toHaveBeenCalledTimes(1);
  });
});
