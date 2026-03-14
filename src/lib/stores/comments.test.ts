import { describe, it, expect } from 'vitest';
import { emptyStats, applyReaction, buildReactionIndex, type Reaction } from './comments.svelte.js';

describe('emptyStats', () => {
  it('should return zeroed stats with empty reactors set', () => {
    const s = emptyStats();
    expect(s.likes).toBe(0);
    expect(s.emojis).toEqual([]);
    expect(s.reactors.size).toBe(0);
  });
});

describe('applyReaction', () => {
  it('should count + as a like', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: '+',
      targetEventId: 'e1'
    });
    expect(stats.likes).toBe(1);
    expect(stats.reactors.has('pk1')).toBe(true);
  });

  it('should count empty string as a like', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: '',
      targetEventId: 'e1'
    });
    expect(stats.likes).toBe(1);
  });

  it('should add custom emoji reaction', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: ':fire:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/fire.png'
    });
    expect(stats.likes).toBe(0);
    expect(stats.emojis).toHaveLength(1);
    expect(stats.emojis[0]).toEqual({
      content: ':fire:',
      url: 'https://example.com/fire.png',
      count: 1
    });
  });

  it('should increment count for duplicate emoji reactions', () => {
    const stats = emptyStats();
    const base = {
      targetEventId: 'e1',
      content: ':fire:',
      emojiUrl: 'https://example.com/fire.png'
    };
    applyReaction(stats, { id: 'r1', pubkey: 'pk1', ...base });
    applyReaction(stats, { id: 'r2', pubkey: 'pk2', ...base });
    expect(stats.emojis[0].count).toBe(2);
  });

  it('should handle non-shortcode text reactions', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: '🔥',
      targetEventId: 'e1'
    });
    expect(stats.emojis).toHaveLength(1);
    expect(stats.emojis[0]).toEqual({ content: '🔥', url: undefined, count: 1 });
  });
});

describe('buildReactionIndex', () => {
  const reactions: Reaction[] = [
    { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'e1' },
    { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'e1' },
    { id: 'r3', pubkey: 'pk3', content: '+', targetEventId: 'e2' },
    {
      id: 'r4',
      pubkey: 'pk4',
      content: ':fire:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/fire.png'
    }
  ];

  it('should group reactions by target event', () => {
    const index = buildReactionIndex(reactions, new Set());
    expect(index.get('e1')?.likes).toBe(2);
    expect(index.get('e2')?.likes).toBe(1);
  });

  it('should exclude deleted reactions', () => {
    const index = buildReactionIndex(reactions, new Set(['r1']));
    expect(index.get('e1')?.likes).toBe(1);
  });

  it('should sort emojis by count descending', () => {
    const moreReactions: Reaction[] = [
      { id: 'r5', pubkey: 'pk5', content: ':heart:', targetEventId: 'e1', emojiUrl: 'h' },
      { id: 'r6', pubkey: 'pk6', content: ':heart:', targetEventId: 'e1', emojiUrl: 'h' },
      ...reactions
    ];
    const index = buildReactionIndex(moreReactions, new Set());
    const emojis = index.get('e1')!.emojis;
    expect(emojis[0].count).toBeGreaterThanOrEqual(emojis[1]?.count ?? 0);
  });

  it('should return empty map for no reactions', () => {
    const index = buildReactionIndex([], new Set());
    expect(index.size).toBe(0);
  });
});
