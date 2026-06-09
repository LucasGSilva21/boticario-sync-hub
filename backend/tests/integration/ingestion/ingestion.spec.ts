import { Readable } from 'node:stream';
import type { S3Event } from 'aws-lambda';
import { XmlProcessingService } from '../../../src/services/xmlProcessingService';
import { SaxXmlParser } from '../../../src/providers/SaxXmlParser';
import { InMemoryQueueProvider } from '../../../src/providers/inmemory/InMemoryQueueProvider';
import type { IBucketProvider } from '../../../src/providers/interfaces/IBucketProvider';
import type { EmployeeUpsertEvent } from '../../../src/types/employee.types';
import type { LogFields } from '../../../src/utils/interfaces/ILogger';

const UPSERT_QUEUE = 'employee-upsert-queue';
const BUCKET = 'employee-sync-batch-files';
const FIXED_ISO = '2026-06-09T00:00:00.000Z';

// Stub local do limite S3 (I/O externo): serve um XML como Readable de Buffers,
// como o Body do GetObjectCommand. O parser e o service exercitados são os reais.
class StubBucketProvider implements IBucketProvider {
  constructor(private readonly xml: string) {}
  getObjectStream(bucket: string, key: string): Promise<Readable> {
    void bucket;
    void key;
    return Promise.resolve(Readable.from([Buffer.from(this.xml, 'utf8')]));
  }
}

type TestLogger = {
  info: jest.Mock<void, [LogFields]>;
  warn: jest.Mock<void, [LogFields]>;
  error: jest.Mock<void, [LogFields]>;
};

function makeLogger(): TestLogger {
  return {
    info: jest.fn<void, [LogFields]>(),
    warn: jest.fn<void, [LogFields]>(),
    error: jest.fn<void, [LogFields]>(),
  };
}

function s3Event(key: string): S3Event {
  return {
    Records: [{ s3: { bucket: { name: BUCKET }, object: { key } } }],
  } as unknown as S3Event;
}

function buildIngestion(xml: string): {
  service: XmlProcessingService;
  queue: InMemoryQueueProvider;
  logger: TestLogger;
} {
  const queue = new InMemoryQueueProvider();
  const logger = makeLogger();
  const service = new XmlProcessingService(
    new StubBucketProvider(xml),
    new SaxXmlParser(),
    queue,
    UPSERT_QUEUE,
    logger,
    () => new Date(FIXED_ISO),
  );
  return { service, queue, logger };
}

function employeeXml(
  id: string,
  name: string,
  department: string,
  position: string,
): string {
  return `<employee><employeeId>${id}</employeeId><name>${name}</name><department>${department}</department><position>${position}</position></employee>`;
}

describe('ingestion integration', () => {
  it('publishes one upsert event per employee parsed from a valid file', async () => {
    const xml = `<employees>${employeeXml('1', 'Ana', 'Tech', 'Dev')}${employeeXml('2', 'Bob', 'Sales', 'Rep')}</employees>`;
    const { service, queue, logger } = buildIngestion(xml);

    await service.handle(s3Event('daily-batch.xml'));

    const messages = await queue.receiveMessages(UPSERT_QUEUE, 10);
    const events = messages.map(
      (m) => JSON.parse(m.body) as EmployeeUpsertEvent,
    );
    expect(events).toEqual([
      {
        employeeId: '1',
        eventType: 'UPSERT',
        eventTimestamp: FIXED_ISO,
        data: { name: 'Ana', department: 'Tech', position: 'Dev' },
      },
      {
        employeeId: '2',
        eventType: 'UPSERT',
        eventTimestamp: FIXED_ISO,
        data: { name: 'Bob', department: 'Sales', position: 'Rep' },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'INGESTED', count: 2 }),
    );
  });

  it('propagates the error and publishes nothing when an employee is invalid', async () => {
    const xml = `<employees><employee><employeeId>1</employeeId><name>Ana</name></employee></employees>`;
    const { service, queue } = buildIngestion(xml);

    await expect(service.handle(s3Event('invalid.xml'))).rejects.toThrow(
      'missing required field',
    );
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(0);
  });

  it('propagates the error and publishes nothing when the XML is malformed', async () => {
    const xml = `<employees><employee></wrong></employees>`;
    const { service, queue } = buildIngestion(xml);

    await expect(service.handle(s3Event('malformed.xml'))).rejects.toThrow();
    expect(await queue.receiveMessages(UPSERT_QUEUE, 10)).toHaveLength(0);
  });
});
