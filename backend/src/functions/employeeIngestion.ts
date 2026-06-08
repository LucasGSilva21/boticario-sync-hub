import type { S3Event } from 'aws-lambda';
import { makeIngestionHandler } from '../factories/makeIngestionHandler';

const service = makeIngestionHandler(); // fora do handler (warm start)

export const handler = (event: S3Event): Promise<void> => service.handle(event);
