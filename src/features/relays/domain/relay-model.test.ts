import { describe, it, expect } from 'vitest';
import {
  parseRelayTags,
  shortUrl,
  stateColor,
  isTransitionalState,
  relayStateLabelKey
} from './relay-model.js';

describe('parseRelayTags', () => {
  it('should parse relay without marker as read+write', () => {
    const tags = [['r', 'wss://relay.example.com']];
    const result = parseRelayTags(tags);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: true }]);
  });

  it('should parse read-only relay', () => {
    const tags = [['r', 'wss://relay.example.com', 'read']];
    const result = parseRelayTags(tags);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: false }]);
  });

  it('should parse write-only relay', () => {
    const tags = [['r', 'wss://relay.example.com', 'write']];
    const result = parseRelayTags(tags);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: false, write: true }]);
  });

  it('should skip non-r tags', () => {
    const tags = [
      ['r', 'wss://a.com'],
      ['p', 'pubkey'],
      ['r', 'wss://b.com']
    ];
    expect(parseRelayTags(tags)).toHaveLength(2);
  });

  it('should skip r-tags without URL', () => {
    const tags = [['r']];
    expect(parseRelayTags(tags)).toEqual([]);
  });

  it('should handle mixed relay lists', () => {
    const tags = [
      ['r', 'wss://rw.example.com'],
      ['r', 'wss://read.example.com', 'read'],
      ['r', 'wss://write.example.com', 'write']
    ];
    expect(parseRelayTags(tags)).toEqual([
      { url: 'wss://rw.example.com', read: true, write: true },
      { url: 'wss://read.example.com', read: true, write: false },
      { url: 'wss://write.example.com', read: false, write: true }
    ]);
  });

  it('should return an empty array for empty tag lists', () => {
    expect(parseRelayTags([])).toEqual([]);
  });
});

describe('shortUrl', () => {
  it('should strip wss://', () => {
    expect(shortUrl('wss://relay.example.com')).toBe('relay.example.com');
  });

  it('should strip ws://', () => {
    expect(shortUrl('ws://relay.example.com')).toBe('relay.example.com');
  });
});

describe('stateColor', () => {
  it('should return green for connected', () => {
    expect(stateColor('connected')).toContain('emerald');
  });

  it('should return amber for connecting', () => {
    expect(stateColor('connecting')).toContain('amber');
  });

  it('should return error for terminated', () => {
    expect(stateColor('terminated')).toContain('error');
  });

  it('should return muted for null', () => {
    expect(stateColor(null)).toContain('muted');
  });
});

describe('relayStateLabelKey', () => {
  it('should map connected state', () => {
    expect(relayStateLabelKey('connected')).toBe('relay.state.connected');
  });

  it('should map initialized state to ready label', () => {
    expect(relayStateLabelKey('initialized')).toBe('relay.state.ready');
  });

  it('should map waiting-for-retrying state to waiting label', () => {
    expect(relayStateLabelKey('waiting-for-retrying')).toBe('relay.state.waiting');
  });

  it('should map terminated state to closed label', () => {
    expect(relayStateLabelKey('terminated')).toBe('relay.state.closed');
  });
});

describe('isTransitionalState', () => {
  it('should return true for connecting', () => {
    expect(isTransitionalState('connecting')).toBe(true);
  });

  it('should return false for connected', () => {
    expect(isTransitionalState('connected')).toBe(false);
  });

  it('should return true for retrying', () => {
    expect(isTransitionalState('retrying')).toBe(true);
  });
});

describe('parseRelayTags — edge cases', () => {
  it('handles duplicate relay URLs (keeps both entries)', () => {
    const tags = [
      ['r', 'wss://relay.example.com'],
      ['r', 'wss://relay.example.com']
    ];
    // parseRelayTags does not deduplicate — caller is responsible
    const result = parseRelayTags(tags);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('wss://relay.example.com');
    expect(result[1].url).toBe('wss://relay.example.com');
  });

  it('handles non-wss relay URL (included as-is — no scheme validation)', () => {
    const tags = [['r', 'http://example.com']];
    // parseRelayTags does not filter by scheme; it passes through any truthy URL
    const result = parseRelayTags(tags);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('http://example.com');
    expect(result[0].read).toBe(true);
    expect(result[0].write).toBe(true);
  });

  it('handles relay tag with missing URL (skips the entry)', () => {
    const tags = [['r']];
    expect(parseRelayTags(tags)).toEqual([]);
  });

  it('handles relay tag with empty string URL (skips the entry)', () => {
    const tags = [['r', '']];
    expect(parseRelayTags(tags)).toEqual([]);
  });

  it('handles empty tags array', () => {
    expect(parseRelayTags([])).toEqual([]);
  });
});
