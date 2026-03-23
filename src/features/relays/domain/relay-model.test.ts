import { describe, it, expect } from 'vitest';
import {
  parseRelayTags,
  shortUrl,
  stateColor,
  isTransitionalState,
  relayStateLabelKey,
  type ConnectionState
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

  it('treats unknown marker as read+write', () => {
    const tags = [['r', 'wss://relay.example.com', 'unknown-marker']];
    const result = parseRelayTags(tags);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: true }]);
  });

  it('handles tag with extra elements beyond marker', () => {
    const tags = [['r', 'wss://relay.example.com', 'read', 'extra-data']];
    const result = parseRelayTags(tags);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: false }]);
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

  it('handles relay tag with empty string URL (skips the entry)', () => {
    const tags = [['r', '']];
    expect(parseRelayTags(tags)).toEqual([]);
  });

  it('preserves order of relay entries', () => {
    const tags = [
      ['r', 'wss://first.com'],
      ['r', 'wss://second.com'],
      ['r', 'wss://third.com']
    ];
    const result = parseRelayTags(tags);
    expect(result.map((r) => r.url)).toEqual([
      'wss://first.com',
      'wss://second.com',
      'wss://third.com'
    ]);
  });

  it('handles tags with various non-r prefixes mixed in', () => {
    const tags = [
      ['e', 'event-id'],
      ['r', 'wss://relay.com'],
      ['p', 'pubkey'],
      ['t', 'tag'],
      ['r', 'wss://relay2.com', 'write']
    ];
    const result = parseRelayTags(tags);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ url: 'wss://relay.com', read: true, write: true });
    expect(result[1]).toEqual({ url: 'wss://relay2.com', read: false, write: true });
  });
});

describe('shortUrl', () => {
  it('should strip wss://', () => {
    expect(shortUrl('wss://relay.example.com')).toBe('relay.example.com');
  });

  it('should strip ws://', () => {
    expect(shortUrl('ws://relay.example.com')).toBe('relay.example.com');
  });

  it('returns original string for non-websocket URLs', () => {
    expect(shortUrl('http://example.com')).toBe('http://example.com');
  });

  it('strips only the first occurrence of wss://', () => {
    expect(shortUrl('wss://wss://double.com')).toBe('wss://double.com');
  });

  it('handles URL with path', () => {
    expect(shortUrl('wss://relay.example.com/path')).toBe('relay.example.com/path');
  });

  it('handles URL with port', () => {
    expect(shortUrl('wss://relay.example.com:8080')).toBe('relay.example.com:8080');
  });

  it('handles empty string', () => {
    expect(shortUrl('')).toBe('');
  });
});

describe('stateColor', () => {
  it('should return green for connected', () => {
    expect(stateColor('connected')).toContain('emerald');
  });

  it('should return amber for connecting', () => {
    expect(stateColor('connecting')).toContain('amber');
  });

  it('should return amber with animate-pulse for connecting', () => {
    expect(stateColor('connecting')).toContain('animate-pulse');
  });

  it('should return amber for retrying', () => {
    expect(stateColor('retrying')).toContain('amber');
  });

  it('should return amber with animate-pulse for retrying', () => {
    expect(stateColor('retrying')).toContain('animate-pulse');
  });

  it('should return error for error state', () => {
    expect(stateColor('error')).toContain('error');
  });

  it('should return error for rejected state', () => {
    expect(stateColor('rejected')).toContain('error');
  });

  it('should return error for terminated', () => {
    expect(stateColor('terminated')).toContain('error');
  });

  it('should return muted for waiting-for-retrying', () => {
    expect(stateColor('waiting-for-retrying')).toContain('muted');
  });

  it('should return muted for dormant', () => {
    expect(stateColor('dormant')).toContain('muted');
  });

  it('should return muted for initialized', () => {
    expect(stateColor('initialized')).toContain('muted');
  });

  it('should return muted for null', () => {
    expect(stateColor(null)).toContain('muted');
  });
});

describe('relayStateLabelKey', () => {
  const expectedMappings: [ConnectionState, string][] = [
    ['connected', 'relay.state.connected'],
    ['connecting', 'relay.state.connecting'],
    ['retrying', 'relay.state.retrying'],
    ['waiting-for-retrying', 'relay.state.waiting'],
    ['dormant', 'relay.state.dormant'],
    ['initialized', 'relay.state.ready'],
    ['error', 'relay.state.error'],
    ['rejected', 'relay.state.rejected'],
    ['terminated', 'relay.state.closed']
  ];

  it.each(expectedMappings)('maps %s to %s', (state, expected) => {
    expect(relayStateLabelKey(state)).toBe(expected);
  });
});

describe('isTransitionalState', () => {
  it('should return true for initialized', () => {
    expect(isTransitionalState('initialized')).toBe(true);
  });

  it('should return true for connecting', () => {
    expect(isTransitionalState('connecting')).toBe(true);
  });

  it('should return true for retrying', () => {
    expect(isTransitionalState('retrying')).toBe(true);
  });

  it('should return true for waiting-for-retrying', () => {
    expect(isTransitionalState('waiting-for-retrying')).toBe(true);
  });

  it('should return false for connected', () => {
    expect(isTransitionalState('connected')).toBe(false);
  });

  it('should return false for dormant', () => {
    expect(isTransitionalState('dormant')).toBe(false);
  });

  it('should return false for error', () => {
    expect(isTransitionalState('error')).toBe(false);
  });

  it('should return false for rejected', () => {
    expect(isTransitionalState('rejected')).toBe(false);
  });

  it('should return false for terminated', () => {
    expect(isTransitionalState('terminated')).toBe(false);
  });
});
