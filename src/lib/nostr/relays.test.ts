import { describe, it, expect } from 'vitest';
import { DEFAULT_RELAYS } from './relays.js';

describe('DEFAULT_RELAYS', () => {
  it('should be a non-empty array', () => {
    expect(Array.isArray(DEFAULT_RELAYS)).toBe(true);
    expect(DEFAULT_RELAYS.length).toBeGreaterThan(0);
  });

  it('should contain only wss:// URLs', () => {
    for (const relay of DEFAULT_RELAYS) {
      expect(relay).toMatch(/^wss:\/\//);
    }
  });

  it('should not contain duplicate entries', () => {
    const unique = new Set(DEFAULT_RELAYS);
    expect(unique.size).toBe(DEFAULT_RELAYS.length);
  });
});
