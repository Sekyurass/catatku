import { describe, expect, it } from 'vitest';
import { budgetStatus } from './budget';

describe('budgetStatus', () => {
  it('aman di bawah 80%', () => {
    expect(budgetStatus(0, 100_000)).toBe('ok');
    expect(budgetStatus(79_999, 100_000)).toBe('ok');
  });

  it('peringatan mulai tepat 80% sampai di bawah 100%', () => {
    expect(budgetStatus(80_000, 100_000)).toBe('warning');
    expect(budgetStatus(99_999, 100_000)).toBe('warning');
  });

  it('terlampaui mulai tepat 100%', () => {
    expect(budgetStatus(100_000, 100_000)).toBe('over');
    expect(budgetStatus(250_000, 100_000)).toBe('over');
  });

  it('tanpa batas selalu aman', () => {
    expect(budgetStatus(50_000, 0)).toBe('ok');
  });
});
