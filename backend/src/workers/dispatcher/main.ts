import { makeDispatcherWorker } from '../../factories/makeDispatcherWorker';

void (async (): Promise<void> => {
  const worker = makeDispatcherWorker();
  await worker.start();
})();
