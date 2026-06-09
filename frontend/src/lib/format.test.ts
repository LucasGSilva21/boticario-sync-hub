import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent, formatTime } from './format';

describe('formatNumber', () => {
  it('groups thousands using the pt-BR separator', () => {
    expect(formatNumber(30000)).toBe('30.000');
  });

  it('returns the plain value for numbers below one thousand', () => {
    expect(formatNumber(59)).toBe('59');
  });
});

describe('formatPercent', () => {
  it('computes the percentage with a single decimal', () => {
    expect(formatPercent(42, 59)).toBe('71,2%');
  });

  it('returns 0% when the total is zero', () => {
    expect(formatPercent(0, 0)).toBe('0%');
  });
});

describe('formatTime', () => {
  it('extracts the UTC time component from an ISO timestamp', () => {
    expect(formatTime('2026-06-09T17:04:01.642Z')).toBe('17:04:01');
  });
});
