import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state';

describe('smoke', () => {
  it('creates a fresh state', () => {
    const s = createInitialState();
    expect(s.credits).toBe(500);
    expect(s.rank).toBe(1);
  });
});
