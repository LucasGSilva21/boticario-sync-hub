import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoSyncStateRepository } from '../../../src/repositories/DynamoSyncStateRepository';

const fixedNow = new Date('2026-06-08T12:00:00.000Z');
const lockExpiresAt = new Date('2026-06-08T12:04:00.000Z');

function conditionalFailure(
  item?: Record<string, AttributeValue>,
): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({
    $metadata: {},
    message: 'The conditional request failed',
    Item: item,
  });
}

describe('DynamoSyncStateRepository', () => {
  it('acquires processing for a new event via a conditional update', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository(
      'EmployeeSyncState',
      client,
      () => fixedNow,
    );

    const result = await repo.tryAcquireProcessing(
      '1',
      'h',
      'UPSERT',
      lockExpiresAt,
    );

    expect(result).toEqual({ acquired: true });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: 'EmployeeSyncState',
          Key: { employeeId: '1', eventHash: 'h' },
          UpdateExpression:
            'SET #status = :processing, #flow = :flow, lockExpiresAt = :lock, updatedAt = :now, createdAt = if_not_exists(createdAt, :now)',
          ConditionExpression:
            'attribute_not_exists(employeeId) OR #status = :failed OR (#status = :processing AND lockExpiresAt < :now)',
          ExpressionAttributeNames: { '#status': 'status', '#flow': 'flow' },
          ExpressionAttributeValues: {
            ':processing': 'PROCESSING',
            ':failed': 'FAILED',
            ':flow': 'UPSERT',
            ':lock': lockExpiresAt.toISOString(),
            ':now': fixedNow.toISOString(),
          },
          ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
        },
      }),
    );
  });

  it('rejects as ALREADY_COMPLETED when the event is COMPLETED', async () => {
    const sendMock = jest
      .fn()
      .mockRejectedValue(conditionalFailure({ status: { S: 'COMPLETED' } }));
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client, () => fixedNow);

    const result = await repo.tryAcquireProcessing(
      '1',
      'h',
      'UPSERT',
      lockExpiresAt,
    );

    expect(result).toEqual({ acquired: false, reason: 'ALREADY_COMPLETED' });
  });

  it('rejects as LOCK_ACTIVE when the event is PROCESSING with a valid lock', async () => {
    const sendMock = jest
      .fn()
      .mockRejectedValue(conditionalFailure({ status: { S: 'PROCESSING' } }));
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client, () => fixedNow);

    const result = await repo.tryAcquireProcessing(
      '1',
      'h',
      'UPSERT',
      lockExpiresAt,
    );

    expect(result).toEqual({ acquired: false, reason: 'LOCK_ACTIVE' });
  });

  it('rejects as LOCK_ACTIVE when the conditional failure carries no item', async () => {
    const sendMock = jest.fn().mockRejectedValue(conditionalFailure());
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client, () => fixedNow);

    const result = await repo.tryAcquireProcessing(
      '1',
      'h',
      'UPSERT',
      lockExpiresAt,
    );

    expect(result).toEqual({ acquired: false, reason: 'LOCK_ACTIVE' });
  });

  it('rethrows errors that are not conditional failures', async () => {
    const sendMock = jest.fn().mockRejectedValue(new Error('throttled'));
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client, () => fixedNow);

    await expect(
      repo.tryAcquireProcessing('1', 'h', 'UPSERT', lockExpiresAt),
    ).rejects.toThrow('throttled');
  });

  it('marks an event as completed', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client, () => fixedNow);

    await repo.markCompleted('1', 'h');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: 't',
          Key: { employeeId: '1', eventHash: 'h' },
          UpdateExpression: 'SET #status = :status, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'COMPLETED',
            ':now': fixedNow.toISOString(),
          },
        },
      }),
    );
  });

  it('marks an event as failed', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client, () => fixedNow);

    await repo.markFailed('1', 'h');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: 't',
          Key: { employeeId: '1', eventHash: 'h' },
          UpdateExpression: 'SET #status = :status, updatedAt = :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'FAILED',
            ':now': fixedNow.toISOString(),
          },
        },
      }),
    );
  });

  it('uses the default clock when none is injected', async () => {
    const sendMock = jest.fn().mockResolvedValue({});
    const client = { send: sendMock } as unknown as DynamoDBDocumentClient;
    const repo = new DynamoSyncStateRepository('t', client);

    await repo.markCompleted('1', 'h');

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('uses a default DynamoDB client when none is provided', () => {
    expect(() => new DynamoSyncStateRepository('t')).not.toThrow();
  });
});
