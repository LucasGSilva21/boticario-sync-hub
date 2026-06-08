import type { S3Event } from 'aws-lambda';

export interface IXmlProcessingService {
  handle(event: S3Event): Promise<void>;
}
