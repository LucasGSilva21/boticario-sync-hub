import { TerminationService } from '../../../src/services/terminationService';

const fixedNow = new Date('2026-06-08T12:00:00.000Z');

type MockedQueue = {
  receiveMessages: jest.Mock<Promise<never[]>, [string, number]>;
  sendMessage: jest.Mock<Promise<void>, [string, string]>;
  sendMessageBatch: jest.Mock<Promise<void>, [string, string[]]>;
  deleteMessage: jest.Mock<Promise<void>, [string, string]>;
};

function makeQueue(): MockedQueue {
  return {
    receiveMessages: jest.fn<Promise<never[]>, [string, number]>(),
    sendMessage: jest.fn<Promise<void>, [string, string]>(),
    sendMessageBatch: jest.fn<Promise<void>, [string, string[]]>(),
    deleteMessage: jest.fn<Promise<void>, [string, string]>(),
  };
}

describe('TerminationService', () => {
  it('publishes a termination event to the priority queue', async () => {
    const queue = makeQueue();
    const service = new TerminationService(queue, 'term-url', () => fixedNow);
    await service.terminate('12345');
    expect(queue.sendMessage).toHaveBeenCalledWith(
      'term-url',
      JSON.stringify({
        employeeId: '12345',
        eventType: 'TERMINATION',
        eventTimestamp: fixedNow.toISOString(),
      }),
    );
  });

  it('uses the default clock when none is injected', async () => {
    const queue = makeQueue();
    const service = new TerminationService(queue, 'term-url');
    await service.terminate('7');
    expect(queue.sendMessage).toHaveBeenCalledTimes(1);
  });
});
