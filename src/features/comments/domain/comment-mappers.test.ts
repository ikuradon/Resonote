import { describe, it, expect } from 'vitest';
import { commentFromEvent, reactionFromEvent } from './comment-mappers.js';

describe('commentFromEvent', () => {
  it('should map basic event fields', () => {
    const comment = commentFromEvent({
      id: 'ev1',
      pubkey: 'pk1',
      content: 'Hello',
      created_at: 1700000000,
      tags: []
    });
    expect(comment.id).toBe('ev1');
    expect(comment.pubkey).toBe('pk1');
    expect(comment.content).toBe('Hello');
    expect(comment.createdAt).toBe(1700000000);
    expect(comment.positionMs).toBeNull();
    expect(comment.replyTo).toBeNull();
    expect(comment.contentWarning).toBeNull();
    expect(comment.emojiTags).toEqual([]);
  });

  it('should parse position tag', () => {
    const comment = commentFromEvent({
      id: 'ev1',
      pubkey: 'pk1',
      content: 'At this moment',
      created_at: 1700000000,
      tags: [['position', '1:30']]
    });
    expect(comment.positionMs).toBe(90000);
  });

  it('should parse reply e-tag', () => {
    const comment = commentFromEvent({
      id: 'ev1',
      pubkey: 'pk1',
      content: 'Reply',
      created_at: 1700000000,
      tags: [['e', 'parent-id']]
    });
    expect(comment.replyTo).toBe('parent-id');
  });

  it('should parse content-warning tag with reason', () => {
    const comment = commentFromEvent({
      id: 'ev1',
      pubkey: 'pk1',
      content: 'Spoiler',
      created_at: 1700000000,
      tags: [['content-warning', 'spoiler ahead']]
    });
    expect(comment.contentWarning).toBe('spoiler ahead');
  });

  it('should parse content-warning tag without reason', () => {
    const comment = commentFromEvent({
      id: 'ev1',
      pubkey: 'pk1',
      content: 'CW',
      created_at: 1700000000,
      tags: [['content-warning']]
    });
    expect(comment.contentWarning).toBe('');
  });

  it('should extract emoji tags', () => {
    const comment = commentFromEvent({
      id: 'ev1',
      pubkey: 'pk1',
      content: ':fire:',
      created_at: 1700000000,
      tags: [['emoji', 'fire', 'https://example.com/fire.png']]
    });
    expect(comment.emojiTags).toHaveLength(1);
    expect(comment.emojiTags[0]).toEqual(['emoji', 'fire', 'https://example.com/fire.png']);
  });
});

describe('reactionFromEvent', () => {
  it('should map reaction with e-tag', () => {
    const reaction = reactionFromEvent({
      id: 'r1',
      pubkey: 'pk1',
      content: '+',
      tags: [['e', 'target-id']]
    });
    expect(reaction).not.toBeNull();
    expect(reaction!.id).toBe('r1');
    expect(reaction!.targetEventId).toBe('target-id');
    expect(reaction!.content).toBe('+');
    expect(reaction!.emojiUrl).toBeUndefined();
  });

  it('should return null when no e-tag', () => {
    const reaction = reactionFromEvent({
      id: 'r1',
      pubkey: 'pk1',
      content: '+',
      tags: []
    });
    expect(reaction).toBeNull();
  });

  it('should extract emoji URL from emoji tag', () => {
    const reaction = reactionFromEvent({
      id: 'r1',
      pubkey: 'pk1',
      content: ':fire:',
      tags: [
        ['e', 'target-id'],
        ['emoji', 'fire', 'https://example.com/fire.png']
      ]
    });
    expect(reaction!.emojiUrl).toBe('https://example.com/fire.png');
  });
});
