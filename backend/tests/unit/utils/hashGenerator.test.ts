import { generateHash } from '../../../src/utils/hashGenerator';

describe('generateHash', () => {
  it('is deterministic: same payload yields the same hash', () => {
    const payload = { employeeId: '1', data: { name: 'Ana' } };
    expect(generateHash(payload)).toBe(generateHash(payload));
  });

  it('is independent of key order (root and nested objects)', () => {
    const a = { employeeId: '1', data: { name: 'Ana', position: 'Dev' } };
    const b = { data: { position: 'Dev', name: 'Ana' }, employeeId: '1' };
    expect(generateHash(a)).toBe(generateHash(b));
  });

  it('produces different hashes for different payloads', () => {
    expect(generateHash({ employeeId: '1' })).not.toBe(
      generateHash({ employeeId: '2' }),
    );
  });

  it('preserves array order (arrays are not reordered)', () => {
    expect(generateHash({ list: [1, 2] })).not.toBe(
      generateHash({ list: [2, 1] }),
    );
  });

  it('returns a 64-char hex SHA-256 hash', () => {
    expect(generateHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
