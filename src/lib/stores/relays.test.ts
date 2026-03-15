import { describe, it, expect } from 'vitest';
import { parseRelayTags } from './relays.svelte.js';

describe('parseRelayTags', () => {
  it('should return read+write for unmarked relay', () => {
    const result = parseRelayTags([['r', 'wss://relay.example.com']]);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: true }]);
  });

  it('should return read-only for "read" marker', () => {
    const result = parseRelayTags([['r', 'wss://relay.example.com', 'read']]);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: false }]);
  });

  it('should return write-only for "write" marker', () => {
    const result = parseRelayTags([['r', 'wss://relay.example.com', 'write']]);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: false, write: true }]);
  });

  it('should handle mixed list correctly', () => {
    const result = parseRelayTags([
      ['r', 'wss://rw.example.com'],
      ['r', 'wss://read.example.com', 'read'],
      ['r', 'wss://write.example.com', 'write']
    ]);
    expect(result).toEqual([
      { url: 'wss://rw.example.com', read: true, write: true },
      { url: 'wss://read.example.com', read: true, write: false },
      { url: 'wss://write.example.com', read: false, write: true }
    ]);
  });

  it('should return empty array for empty tags', () => {
    const result = parseRelayTags([]);
    expect(result).toEqual([]);
  });

  it('should ignore non-r tags', () => {
    const result = parseRelayTags([
      ['p', 'wss://not-a-relay.example.com'],
      ['e', 'some-event-id'],
      ['r', 'wss://relay.example.com']
    ]);
    expect(result).toEqual([{ url: 'wss://relay.example.com', read: true, write: true }]);
  });

  it('should ignore r tags without url', () => {
    const result = parseRelayTags([['r']]);
    expect(result).toEqual([]);
  });
});
