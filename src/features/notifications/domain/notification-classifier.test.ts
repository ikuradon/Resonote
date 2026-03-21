import { describe, it, expect } from 'vitest';
import { classifyNotificationEvent } from './notification-classifier.js';

const MY_PK = 'my-pubkey';

describe('classifyNotificationEvent', () => {
  it('should return null for own events', () => {
    const event = { pubkey: MY_PK, kind: 1111, tags: [['p', MY_PK]] };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBeNull();
  });

  it('should classify kind:7 with p-tag as reaction', () => {
    const event = {
      pubkey: 'other',
      kind: 7,
      tags: [
        ['p', MY_PK],
        ['e', 'ev1']
      ]
    };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBe('reaction');
  });

  it('should classify kind:1111 with p-tag + e-tag as reply', () => {
    const event = {
      pubkey: 'other',
      kind: 1111,
      tags: [
        ['p', MY_PK],
        ['e', 'ev1']
      ]
    };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBe('reply');
  });

  it('should classify kind:1111 with p-tag only as mention', () => {
    const event = { pubkey: 'other', kind: 1111, tags: [['p', MY_PK]] };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBe('mention');
  });

  it('should classify kind:1111 from followed user as follow_comment', () => {
    const follows = new Set(['friend']);
    const event = { pubkey: 'friend', kind: 1111, tags: [['I', 'spotify:track:abc']] };
    expect(classifyNotificationEvent(event, MY_PK, follows)).toBe('follow_comment');
  });

  it('should return null for kind:1111 from stranger without p-tag', () => {
    const event = { pubkey: 'stranger', kind: 1111, tags: [['I', 'spotify:track:abc']] };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBeNull();
  });

  it('should return null for kind:7 without p-tag', () => {
    const event = { pubkey: 'other', kind: 7, tags: [['e', 'ev1']] };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBeNull();
  });

  it('should return null for unknown kinds', () => {
    const event = { pubkey: 'other', kind: 9999, tags: [['p', MY_PK]] };
    expect(classifyNotificationEvent(event, MY_PK, new Set())).toBeNull();
  });

  it('should prioritize reaction over follow_comment for kind:7', () => {
    const follows = new Set(['other']);
    const event = { pubkey: 'other', kind: 7, tags: [['p', MY_PK]] };
    expect(classifyNotificationEvent(event, MY_PK, follows)).toBe('reaction');
  });

  it('should prioritize reply over follow_comment', () => {
    const follows = new Set(['other']);
    const event = {
      pubkey: 'other',
      kind: 1111,
      tags: [
        ['p', MY_PK],
        ['e', 'parent']
      ]
    };
    expect(classifyNotificationEvent(event, MY_PK, follows)).toBe('reply');
  });
});
