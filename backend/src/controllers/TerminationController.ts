import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ITerminationService } from '../services/interfaces/ITerminationService';
import type { ILogger } from '../utils/interfaces/ILogger';

export class TerminationController {
  constructor(
    private readonly service: ITerminationService,
    private readonly logger: ILogger,
  ) {}

  async handle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const employeeId = extractEmployeeId(event.body);
    if (employeeId === undefined) {
      return response(400, {
        message: 'Invalid payload: a non-empty employeeId is required',
      });
    }

    try {
      await this.service.terminate(employeeId);
      this.logger.info({ employeeId, flow: 'TERMINATION', status: 'QUEUED' });
      return response(202, { status: 'QUEUED', employeeId });
    } catch (error) {
      this.logger.error({
        employeeId,
        flow: 'TERMINATION',
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
      return response(500, { message: 'Internal error' });
    }
  }
}

function extractEmployeeId(body: string | null): string | undefined {
  if (body === null) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const employeeId = (parsed as { employeeId?: unknown } | null)?.employeeId;
  return typeof employeeId === 'string' && employeeId.length > 0
    ? employeeId
    : undefined;
}

function response(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
