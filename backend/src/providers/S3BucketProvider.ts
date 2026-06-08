import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { IBucketProvider } from './interfaces/IBucketProvider';

export class S3BucketProvider implements IBucketProvider {
  constructor(private readonly client: S3Client = new S3Client({})) {}

  async getObjectStream(bucket: string, key: string): Promise<Readable> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    if (!(Body instanceof Readable)) {
      throw new Error(`Unexpected empty body for s3://${bucket}/${key}`);
    }

    return Body;
  }
}
