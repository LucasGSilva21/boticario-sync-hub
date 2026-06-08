import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { S3BucketProvider } from '../../../src/providers/S3BucketProvider';

describe('S3BucketProvider', () => {
  it('sends a GetObjectCommand and returns the body stream', async () => {
    const body = Readable.from('<employees/>');
    const sendMock = jest
      .fn<Promise<{ Body: Readable }>, [GetObjectCommand]>()
      .mockResolvedValue({ Body: body });
    const client = { send: sendMock } as unknown as S3Client;

    const provider = new S3BucketProvider(client);
    const stream = await provider.getObjectStream('my-bucket', 'file.xml');

    expect(stream).toBe(body);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: 'my-bucket', Key: 'file.xml' },
      }),
    );
    expect(sendMock.mock.lastCall?.[0]).toBeInstanceOf(GetObjectCommand);
  });

  it('throws when the response has no readable body', async () => {
    const sendMock = jest.fn().mockResolvedValue({ Body: undefined });
    const client = { send: sendMock } as unknown as S3Client;

    const provider = new S3BucketProvider(client);

    await expect(provider.getObjectStream('b', 'k')).rejects.toThrow(
      'Unexpected empty body for s3://b/k',
    );
  });

  it('uses a default S3 client when none is provided', () => {
    expect(() => new S3BucketProvider()).not.toThrow();
  });
});
