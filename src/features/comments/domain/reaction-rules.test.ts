import { describe, it, expect } from 'vitest';
import { emptyStats, isLikeReaction, applyReaction, buildReactionIndex } from './reaction-rules.js';
import type { Reaction } from './comment-model.js';

describe('isLikeReaction', () => {
  it('should return true for +', () => {
    expect(isLikeReaction('+')).toBe(true);
  });

  it('should return true for empty string', () => {
    expect(isLikeReaction('')).toBe(true);
  });

  it('should return false for emoji content', () => {
    expect(isLikeReaction(':fire:')).toBe(false);
    expect(isLikeReaction('🔥')).toBe(false);
  });
});

describe('emptyStats', () => {
  it('should return zeroed stats with an empty reactors set', () => {
    const stats = emptyStats();
    expect(stats.likes).toBe(0);
    expect(stats.emojis).toEqual([]);
    expect(stats.reactors.size).toBe(0);
  });
});

describe('applyReaction (immutable)', () => {
  it('should not mutate the original stats', () => {
    const original = emptyStats();
    const result = applyReaction(original, {
      id: 'r1',
      pubkey: 'pk1',
      content: '+',
      targetEventId: 'e1'
    });
    expect(original.likes).toBe(0);
    expect(original.reactors.size).toBe(0);
    expect(result.likes).toBe(1);
    expect(result.reactors.has('pk1')).toBe(true);
  });

  it('should accumulate likes', () => {
    let stats = emptyStats();
    stats = applyReaction(stats, { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'e1' });
    stats = applyReaction(stats, { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'e1' });
    expect(stats.likes).toBe(2);
    expect(stats.reactors.size).toBe(2);
  });

  it('should count empty string as a like', () => {
    const result = applyReaction(emptyStats(), {
      id: 'r1',
      pubkey: 'pk1',
      content: '',
      targetEventId: 'e1'
    });
    expect(result.likes).toBe(1);
  });

  it('should add a custom emoji reaction', () => {
    const result = applyReaction(emptyStats(), {
      id: 'r1',
      pubkey: 'pk1',
      content: ':fire:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/fire.png'
    });
    expect(result.likes).toBe(0);
    expect(result.emojis).toEqual([
      { content: ':fire:', url: 'https://example.com/fire.png', count: 1 }
    ]);
  });

  it('should group custom emojis by URL', () => {
    let stats = emptyStats();
    stats = applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: ':a:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/a.png'
    });
    stats = applyReaction(stats, {
      id: 'r2',
      pubkey: 'pk2',
      content: ':b:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/a.png'
    });
    expect(stats.emojis).toHaveLength(1);
    expect(stats.emojis[0].count).toBe(2);
  });

  it('should group unicode emoji reactions by content', () => {
    let stats = applyReaction(emptyStats(), {
      id: 'r1',
      pubkey: 'pk1',
      content: '🔥',
      targetEventId: 'e1'
    });
    stats = applyReaction(stats, {
      id: 'r2',
      pubkey: 'pk2',
      content: '🔥',
      targetEventId: 'e1'
    });
    expect(stats.emojis).toEqual([{ content: '🔥', url: undefined, count: 2 }]);
  });
});

describe('buildReactionIndex', () => {
  const reactions: Reaction[] = [
    { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'e1' },
    { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'e1' },
    { id: 'r3', pubkey: 'pk3', content: '+', targetEventId: 'e2' }
  ];

  it('should group reactions by target event ID', () => {
    const index = buildReactionIndex(reactions, new Set());
    expect(index.get('e1')?.likes).toBe(2);
    expect(index.get('e2')?.likes).toBe(1);
  });

  it('should exclude deleted reactions', () => {
    const index = buildReactionIndex(reactions, new Set(['r1']));
    expect(index.get('e1')?.likes).toBe(1);
  });

  it('should return empty map for empty reactions', () => {
    const index = buildReactionIndex([], new Set());
    expect(index.size).toBe(0);
  });

  it('should track reactors across grouped reactions', () => {
    const withEmoji: Reaction[] = [
      ...reactions,
      {
        id: 'r4',
        pubkey: 'pk4',
        content: ':fire:',
        targetEventId: 'e1',
        emojiUrl: 'https://example.com/fire.png'
      }
    ];
    const index = buildReactionIndex(withEmoji, new Set());
    expect(index.get('e1')!.reactors.size).toBe(3);
    expect(index.get('e2')!.reactors.size).toBe(1);
  });

  it('should sort emojis by count descending', () => {
    const emojiReactions: Reaction[] = [
      { id: 'r1', pubkey: 'pk1', content: '🔥', targetEventId: 'e1' },
      { id: 'r2', pubkey: 'pk2', content: '🎵', targetEventId: 'e1' },
      { id: 'r3', pubkey: 'pk3', content: '🎵', targetEventId: 'e1' }
    ];
    const index = buildReactionIndex(emojiReactions, new Set());
    const emojis = index.get('e1')!.emojis;
    expect(emojis[0].content).toBe('🎵');
    expect(emojis[1].content).toBe('🔥');
  });
});
