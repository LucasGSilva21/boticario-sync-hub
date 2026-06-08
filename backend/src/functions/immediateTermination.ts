import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { makeTerminationHandler } from '../factories/makeTerminationHandler';

const controller = makeTerminationHandler(); // fora do handler (warm start)

export const handler = (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => controller.handle(event);
