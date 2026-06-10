import { CircuitBreaker } from '../../../src/utils/circuitBreaker';

describe('CircuitBreaker', () => {
  it('starts closed (isOpen=false)', () => {
    const cb = new CircuitBreaker(30, 5);
    expect(cb.isOpen()).toBe(false);
  });

  it('opens after reaching the consecutive failure threshold', () => {
    const cb = new CircuitBreaker(30, 3);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false); // 2 < 3
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true); // 3 >= 3 -> OPEN
  });

  it('resets the failure counter on success', () => {
    const cb = new CircuitBreaker(30, 2);
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    expect(cb.isOpen()).toBe(false); // counter reset; only 1 failure
  });

  it('transitions OPEN->HALF_OPEN after the reset timeout', () => {
    let current = 1_000;
    const cb = new CircuitBreaker(30, 1, () => current);
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true); // within the timeout
    current += 30_000;
    expect(cb.isOpen()).toBe(false); // half-open: allows one trial
  });

  it('closes on success while HALF_OPEN', () => {
    let current = 0;
    const cb = new CircuitBreaker(10, 1, () => current);
    cb.recordFailure();
    current += 10_000;
    expect(cb.isOpen()).toBe(false); // HALF_OPEN
    cb.recordSuccess(); // -> CLOSED
    expect(cb.isOpen()).toBe(false);
  });

  it('reopens immediately on failure while HALF_OPEN', () => {
    let current = 0;
    const cb = new CircuitBreaker(10, 5, () => current);
    for (let i = 0; i < 5; i += 1) {
      cb.recordFailure();
    }
    expect(cb.isOpen()).toBe(true);
    current += 10_000;
    expect(cb.isOpen()).toBe(false); // HALF_OPEN
    cb.recordFailure(); // HALF_OPEN -> OPEN
    expect(cb.isOpen()).toBe(true);
  });

  it('invokes the onOpen hook on each transition to OPEN', () => {
    let current = 0;
    const onOpen = jest.fn<void, []>();
    const cb = new CircuitBreaker(10, 2, () => current, onOpen);
    cb.recordFailure();
    cb.recordFailure(); // threshold -> OPEN (1st)
    expect(onOpen).toHaveBeenCalledTimes(1);
    current += 10_000;
    expect(cb.isOpen()).toBe(false); // HALF_OPEN
    cb.recordFailure(); // HALF_OPEN -> OPEN (2nd)
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  describe('tryProceed (single-trial)', () => {
    it('always proceeds while CLOSED', () => {
      const cb = new CircuitBreaker(30, 5);
      expect(cb.tryProceed()).toBe(true);
      expect(cb.tryProceed()).toBe(true);
    });

    it('blocks every attempt while OPEN within the cooldown', () => {
      const current = 0;
      const cb = new CircuitBreaker(30, 1, () => current);
      cb.recordFailure(); // OPEN
      expect(cb.tryProceed()).toBe(false);
      expect(cb.tryProceed()).toBe(false);
    });

    it('admits exactly one probe when the cooldown expires', () => {
      let current = 0;
      const cb = new CircuitBreaker(30, 1, () => current);
      cb.recordFailure(); // OPEN
      current += 30_000;
      expect(cb.tryProceed()).toBe(true); // a sonda
      expect(cb.tryProceed()).toBe(false); // demais barradas (single-trial)
      expect(cb.tryProceed()).toBe(false);
    });

    it('reopens after a failed probe and blocks again', () => {
      let current = 0;
      const cb = new CircuitBreaker(30, 1, () => current);
      cb.recordFailure(); // OPEN
      current += 30_000;
      expect(cb.tryProceed()).toBe(true); // sonda
      cb.recordFailure(); // sonda falhou -> OPEN
      expect(cb.tryProceed()).toBe(false);
    });

    it('closes after a successful probe and proceeds freely', () => {
      let current = 0;
      const cb = new CircuitBreaker(30, 1, () => current);
      cb.recordFailure(); // OPEN
      current += 30_000;
      expect(cb.tryProceed()).toBe(true); // sonda
      cb.recordSuccess(); // sonda ok -> CLOSED
      expect(cb.tryProceed()).toBe(true);
      expect(cb.tryProceed()).toBe(true);
    });

    it('admits a fresh probe after isOpen transitions to HALF_OPEN', () => {
      let current = 0;
      const cb = new CircuitBreaker(30, 1, () => current);
      cb.recordFailure(); // OPEN
      current += 30_000;
      expect(cb.isOpen()).toBe(false); // isOpen transiciona OPEN -> HALF_OPEN
      expect(cb.tryProceed()).toBe(true); // 1ª sonda no half-open
      expect(cb.tryProceed()).toBe(false); // single-trial
    });
  });
});
