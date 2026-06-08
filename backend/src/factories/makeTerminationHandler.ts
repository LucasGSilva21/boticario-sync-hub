import { env } from '../config/env';
import { TerminationController } from '../controllers/TerminationController';
import { TerminationService } from '../services/terminationService';
import { SqsQueueProvider } from '../providers/SqsQueueProvider';
import { logger } from '../utils/logger';

export function makeTerminationHandler(): TerminationController {
  const queueProvider = new SqsQueueProvider(env.sqsWaitTimeSeconds);
  const terminationService = new TerminationService(
    queueProvider,
    env.employeeTerminationQueueUrl,
  );
  return new TerminationController(terminationService, logger);
}
