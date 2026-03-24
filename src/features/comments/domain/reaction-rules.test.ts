import { describe, expect, it } from 'vitest';

import type { Reaction } from './comment-model.js';
import { applyReaction, buildReactionIndex, emptyStats, isLikeReaction } from './reaction-rules.js';

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

describe('buildReactionIndex with deletedIds', () => {
  it('excludes deleted reactions from the index', () => {
    const reactions: Reaction[] = [
      { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'e1' },
      { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'e1' },
      { id: 'r3', pubkey: 'pk3', content: '🔥', targetEventId: 'e1' }
    ];
    // r1 and r3 are deleted
    const deletedIds = new Set(['r1', 'r3']);
    const index = buildReactionIndex(reactions, deletedIds);

    const stats = index.get('e1')!;
    // Only r2 survives: 1 like, 0 emojis
    expect(stats.likes).toBe(1);
    expect(stats.emojis).toHaveLength(0);
    expect(stats.reactors.has('pk2')).toBe(true);
    expect(stats.reactors.has('pk1')).toBe(false);
    expect(stats.reactors.has('pk3')).toBe(false);
  });

  it('does not exclude reactions whose target comment is deleted (only own ID matters)', () => {
    // The reaction itself is NOT deleted, but it targets a comment whose ID
    // happens to be in deletedIds. The deletion logic here only skips reactions
    // whose own ID is in deletedIds — the reaction should still appear.
    const reactions: Reaction[] = [
      { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'deleted-comment' },
      { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'alive-comment' }
    ];
    // 'deleted-comment' is in deletedIds as a comment ID — but r1's id is 'r1'
    const deletedIds = new Set(['deleted-comment']);
    const index = buildReactionIndex(reactions, deletedIds);

    // r1 is NOT in deletedIds by its own ID, so it must appear in the index
    expect(index.has('deleted-comment')).toBe(true);
    expect(index.get('deleted-comment')!.likes).toBe(1);
    // r2 also appears
    expect(index.get('alive-comment')!.likes).toBe(1);
  });

  it('all reactions deleted results in empty index for that target', () => {
    const reactions: Reaction[] = [
      { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'e1' },
      { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'e1' }
    ];
    const deletedIds = new Set(['r1', 'r2']);
    const index = buildReactionIndex(reactions, deletedIds);
    // No surviving reactions → key should not appear
    expect(index.has('e1')).toBe(false);
  });
});

describe('applyReaction — incremental consistency', () => {
  const makeReaction = (
    id: string,
    pubkey: string,
    content: string,
    targetEventId: string,
    emojiUrl?: string
  ): Reaction => ({
    id,
    pubkey,
    content,
    targetEventId,
    emojiUrl
  });

  it('incremental applyReaction matches batch buildReactionIndex', () => {
    const reactions: Reaction[] = [
      makeReaction('r1', 'pk1', '+', 'e1'),
      makeReaction('r2', 'pk2', '+', 'e1'),
      makeReaction('r3', 'pk3', ':fire:', 'e1', 'https://example.com/fire.png'),
      makeReaction('r4', 'pk4', '+', 'e2'),
      makeReaction('r5', 'pk5', '🎵', 'e2')
    ];

    // Method A: incremental via applyReaction
    let statsE1 = emptyStats();
    let statsE2 = emptyStats();
    for (const r of reactions) {
      if (r.targetEventId === 'e1') statsE1 = applyReaction(statsE1, r);
      else statsE2 = applyReaction(statsE2, r);
    }

    // Method B: batch via buildReactionIndex
    const index = buildReactionIndex(reactions, new Set());
    const batchE1 = index.get('e1')!;
    const batchE2 = index.get('e2')!;

    expect(statsE1.likes).toBe(batchE1.likes);
    expect(statsE1.reactors.size).toBe(batchE1.reactors.size);
    // emoji counts match (order may differ in incremental)
    expect(statsE1.emojis.map((e) => e.count).sort()).toEqual(
      batchE1.emojis.map((e) => e.count).sort()
    );

    expect(statsE2.likes).toBe(batchE2.likes);
    expect(statsE2.emojis).toHaveLength(batchE2.emojis.length);
  });

  it('applyReaction with same pubkey reacting twice counts both but reactors.size stays 1', () => {
    let stats = emptyStats();
    stats = applyReaction(stats, makeReaction('r1', 'pk1', '+', 'e1'));
    stats = applyReaction(stats, makeReaction('r2', 'pk1', '+', 'e1'));
    // likes increments each call — applyReaction has no dedup logic
    expect(stats.likes).toBe(2);
    // reactors is a Set so same pubkey only counted once
    expect(stats.reactors.size).toBe(1);
  });

  it('custom emoji reactions are sorted by count descending in buildReactionIndex', () => {
    const reactions: Reaction[] = [
      makeReaction('r1', 'pk1', ':fire:', 'e1', 'https://example.com/fire.png'),
      makeReaction('r2', 'pk2', ':fire:', 'e1', 'https://example.com/fire.png'),
      makeReaction('r3', 'pk3', ':fire:', 'e1', 'https://example.com/fire.png'),
      makeReaction('r4', 'pk4', ':star:', 'e1', 'https://example.com/star.png')
    ];
    const index = buildReactionIndex(reactions, new Set());
    const emojis = index.get('e1')!.emojis;
    expect(emojis[0].url).toBe('https://example.com/fire.png');
    expect(emojis[0].count).toBe(3);
    expect(emojis[1].url).toBe('https://example.com/star.png');
    expect(emojis[1].count).toBe(1);
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
