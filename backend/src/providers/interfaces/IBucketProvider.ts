import type { Readable } from 'node:stream';

export interface IBucketProvider {
  getObjectStream(bucket: string, key: string): Promise<Readable>;
}
