/**
 * Pure functions for reaction aggregation and statistics.
 * No side effects, no infra dependencies.
 */

import type { Reaction, ReactionStats } from './comment-model.js';

export function emptyStats(): ReactionStats {
  return { likes: 0, emojis: [], reactors: new Set() };
}

export function isLikeReaction(content: string): boolean {
  return content === '+' || content === '';
}

/**
 * Apply a single reaction to a stats object.
 * Returns a new ReactionStats (immutable).
 */
export function applyReaction(stats: ReactionStats, r: Reaction): ReactionStats {
  const reactors = new Set(stats.reactors);
  reactors.add(r.pubkey);

  if (isLikeReaction(r.content)) {
    return { likes: stats.likes + 1, emojis: [...stats.emojis], reactors };
  }

  const emojis = stats.emojis.map((e) => ({ ...e }));
  const existing = emojis.find((e) => (e.url ? e.url === r.emojiUrl : e.content === r.content));
  if (existing) {
    existing.count++;
  } else {
    emojis.push({ content: r.content, url: r.emojiUrl, count: 1 });
  }
  return { likes: stats.likes, emojis, reactors };
}

/**
 * Build the full reaction index from a list of reactions, excluding deleted IDs.
 * Returns a new Map (immutable).
 */
export function buildReactionIndex(
  reactions: Reaction[],
  deletedIds: Set<string>
): Map<string, ReactionStats> {
  const index = new Map<string, ReactionStats>();
  for (const r of reactions) {
    if (deletedIds.has(r.id)) continue;
    const prev = index.get(r.targetEventId) ?? emptyStats();
    index.set(r.targetEventId, applyReaction(prev, r));
  }
  for (const [key, stats] of index) {
    const sorted = [...stats.emojis].sort((a, b) => b.count - a.count);
    index.set(key, { ...stats, emojis: sorted });
  }
  return index;
}
