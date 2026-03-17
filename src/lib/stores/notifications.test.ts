import { describe, it, expect } from 'vitest';
import { classifyEvent } from './notifications.svelte.js';

const MY_PUBKEY = 'my-pubkey';

function makeEvent(
  overrides: Partial<{
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    kind: number;
    tags: string[][];
  }> = {}
) {
  return {
    id: overrides.id ?? 'event-1',
    pubkey: overrides.pubkey ?? 'other-pubkey',
    content: overrides.content ?? 'hello',
    created_at: overrides.created_at ?? 1000,
    kind: overrides.kind ?? 1111,
    tags: overrides.tags ?? []
  };
}

describe('classifyEvent', () => {
  it('should return null for own events', () => {
    const event = makeEvent({ pubkey: MY_PUBKEY, kind: 7, tags: [['p', MY_PUBKEY]] });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBeNull();
  });

  it('should classify kind:7 with p-tag as reaction', () => {
    const event = makeEvent({
      kind: 7,
      tags: [
        ['p', MY_PUBKEY],
        ['e', 'target-id']
      ]
    });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBe('reaction');
  });

  it('should return null for kind:7 without p-tag', () => {
    const event = makeEvent({ kind: 7, tags: [['e', 'target-id']] });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBeNull();
  });

  it('should classify kind:1111 with p-tag + e-tag as reply', () => {
    const event = makeEvent({
      kind: 1111,
      tags: [
        ['p', MY_PUBKEY],
        ['e', 'parent-id']
      ]
    });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBe('reply');
  });

  it('should classify kind:1111 with p-tag only as mention', () => {
    const event = makeEvent({ kind: 1111, tags: [['p', MY_PUBKEY]] });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBe('mention');
  });

  it('should classify kind:1111 from followed user as follow_comment', () => {
    const follows = new Set(['other-pubkey']);
    const event = makeEvent({ kind: 1111, pubkey: 'other-pubkey' });
    expect(classifyEvent(event, MY_PUBKEY, follows)).toBe('follow_comment');
  });

  it('should return null for kind:1111 from non-followed stranger', () => {
    const event = makeEvent({ kind: 1111, pubkey: 'stranger' });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBeNull();
  });

  it('should return null for unknown kind', () => {
    const event = makeEvent({ kind: 9999, tags: [['p', MY_PUBKEY]] });
    expect(classifyEvent(event, MY_PUBKEY, new Set())).toBeNull();
  });

  it('should prioritize reaction over follow_comment for kind:7', () => {
    const follows = new Set(['other-pubkey']);
    const event = makeEvent({ kind: 7, pubkey: 'other-pubkey', tags: [['p', MY_PUBKEY]] });
    expect(classifyEvent(event, MY_PUBKEY, follows)).toBe('reaction');
  });

  it('should prioritize reply over follow_comment', () => {
    const follows = new Set(['other-pubkey']);
    const event = makeEvent({
      kind: 1111,
      pubkey: 'other-pubkey',
      tags: [
        ['p', MY_PUBKEY],
        ['e', 'parent']
      ]
    });
    expect(classifyEvent(event, MY_PUBKEY, follows)).toBe('reply');
  });
});
