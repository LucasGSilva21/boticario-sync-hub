import type { S3Event } from 'aws-lambda';
import type { EmployeeUpsertEvent } from '../types/employee.types';
import type { IBucketProvider } from '../providers/interfaces/IBucketProvider';
import type { IQueueProvider } from '../providers/interfaces/IQueueProvider';
import type { IXmlParser } from '../providers/interfaces/IXmlParser';
import type { ILogger } from '../utils/interfaces/ILogger';
import type { IXmlProcessingService } from './interfaces/IXmlProcessingService';

export class XmlProcessingService implements IXmlProcessingService {
  constructor(
    private readonly bucket: IBucketProvider,
    private readonly parser: IXmlParser,
    private readonly queue: IQueueProvider,
    private readonly upsertQueueUrl: string,
    private readonly logger: ILogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(event: S3Event): Promise<void> {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      // A key chega URL-encoded (espaços viram '+'; acentos, '%xx').
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      await this.processObject(bucket, key);
    }
  }

  private async processObject(bucket: string, key: string): Promise<void> {
    const stream = await this.bucket.getObjectStream(bucket, key);
    let count = 0;

    for await (const employee of this.parser.parse(stream)) {
      const upsertEvent: EmployeeUpsertEvent = {
        employeeId: employee.employeeId,
        eventType: 'UPSERT',
        eventTimestamp: this.now().toISOString(),
        data: employee.data,
      };
      await this.queue.sendMessage(
        this.upsertQueueUrl,
        JSON.stringify(upsertEvent),
      );
      count += 1;
    }

    this.logger.info({
      timestamp: this.now().toISOString(),
      flow: 'UPSERT',
      status: 'INGESTED',
      bucket,
      key,
      count,
    });
  }
}
