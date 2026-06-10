import type { S3Event } from 'aws-lambda';
import type { EmployeeUpsertEvent } from '../types/employee.types';
import type { IBucketProvider } from '../providers/interfaces/IBucketProvider';
import type { IQueueProvider } from '../providers/interfaces/IQueueProvider';
import type { IXmlParser } from '../providers/interfaces/IXmlParser';
import type { ILogger } from '../utils/interfaces/ILogger';
import type { IXmlProcessingService } from './interfaces/IXmlProcessingService';

// Drena o buffer a cada N eventos para manter a memória O(1) no streaming de
// ~30k registros (não acumula o arquivo inteiro). É um limite de MEMÓRIA deste
// service; quantas mensagens cabem por chamada da fila é responsabilidade do
// IQueueProvider — o service não conhece a tecnologia por trás.
const PUBLISH_BATCH_SIZE = 10;

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
    let buffer: string[] = [];

    for await (const employee of this.parser.parse(stream)) {
      const upsertEvent: EmployeeUpsertEvent = {
        employeeId: employee.employeeId,
        eventType: 'UPSERT',
        eventTimestamp: this.now().toISOString(),
        data: employee.data,
      };
      buffer.push(JSON.stringify(upsertEvent));
      // Drena o lote: delega à fila publicar em bloco (1 ida à rede por lote,
      // não por colaborador). Como fatiar isso no transporte é com o provider.
      if (buffer.length >= PUBLISH_BATCH_SIZE) {
        await this.queue.sendMessageBatch(this.upsertQueueUrl, buffer);
        count += buffer.length;
        buffer = [];
      }
    }

    // Flush do resto (último lote parcial). Se o parser lançar antes daqui, o
    // buffer é descartado e a ingestão inteira vai à DLQ — sem publicação parcial.
    if (buffer.length > 0) {
      await this.queue.sendMessageBatch(this.upsertQueueUrl, buffer);
      count += buffer.length;
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
