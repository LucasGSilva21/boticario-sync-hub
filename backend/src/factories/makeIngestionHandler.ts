import { env } from '../config/env';
import { XmlProcessingService } from '../services/xmlProcessingService';
import { S3BucketProvider } from '../providers/S3BucketProvider';
import { SaxXmlParser } from '../providers/SaxXmlParser';
import { SqsQueueProvider } from '../providers/SqsQueueProvider';
import { logger } from '../utils/logger';

export function makeIngestionHandler(): XmlProcessingService {
  const bucketProvider = new S3BucketProvider();
  const xmlParser = new SaxXmlParser();
  const queueProvider = new SqsQueueProvider(env.sqsWaitTimeSeconds);
  return new XmlProcessingService(
    bucketProvider,
    xmlParser,
    queueProvider,
    env.employeeUpsertQueueUrl,
    logger,
  );
}
