import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { FlowType } from '../types/employee.types';
import type {
  AcquireResult,
  ISyncStateRepository,
} from './interfaces/ISyncStateRepository';

export class DynamoSyncStateRepository implements ISyncStateRepository {
  constructor(
    private readonly tableName: string,
    private readonly client: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({}),
    ),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async tryAcquireProcessing(
    employeeId: string,
    eventHash: string,
    flow: FlowType,
    lockExpiresAt: Date,
  ): Promise<AcquireResult> {
    const nowIso = this.now().toISOString();
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { employeeId, eventHash },
          // Recupera órfãos/FAILED e cria inexistentes; preserva createdAt.
          UpdateExpression:
            'SET #status = :processing, #flow = :flow, lockExpiresAt = :lock, updatedAt = :now, createdAt = if_not_exists(createdAt, :now)',
          // Zero-Read: a duplicidade é validada só pela condição.
          ConditionExpression:
            'attribute_not_exists(employeeId) OR #status = :failed OR (#status = :processing AND lockExpiresAt < :now)',
          ExpressionAttributeNames: { '#status': 'status', '#flow': 'flow' },
          ExpressionAttributeValues: {
            ':processing': 'PROCESSING',
            ':failed': 'FAILED',
            ':flow': flow,
            ':lock': lockExpiresAt.toISOString(),
            ':now': nowIso,
          },
          // Sem GetItem: o item antigo volta junto da falha condicional.
          ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
        }),
      );
      return { acquired: true };
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        const status = (error.Item?.status as { S?: string } | undefined)?.S;
        return {
          acquired: false,
          reason: status === 'COMPLETED' ? 'ALREADY_COMPLETED' : 'LOCK_ACTIVE',
        };
      }
      throw error;
    }
  }

  async markCompleted(employeeId: string, eventHash: string): Promise<void> {
    await this.setStatus(employeeId, eventHash, 'COMPLETED');
  }

  async markFailed(employeeId: string, eventHash: string): Promise<void> {
    await this.setStatus(employeeId, eventHash, 'FAILED');
  }

  private async setStatus(
    employeeId: string,
    eventHash: string,
    status: 'COMPLETED' | 'FAILED',
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { employeeId, eventHash },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':now': this.now().toISOString(),
        },
      }),
    );
  }
}
