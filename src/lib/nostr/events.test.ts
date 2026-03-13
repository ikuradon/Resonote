import { describe, it, expect } from 'vitest';
import {
  buildComment,
  buildShare,
  buildReaction,
  buildDeletion,
  formatPosition,
  parsePosition,
  extractHashtags
} from './events.js';
import { SpotifyProvider } from '../content/spotify.js';
import type { ContentId, ContentProvider } from '../content/types.js';

const provider: ContentProvider = new SpotifyProvider();

const trackId: ContentId = { platform: 'spotify', type: 'track', id: 'abc123' };
const episodeId: ContentId = { platform: 'spotify', type: 'episode', id: 'ep456' };

describe('buildComment', () => {
  it('should build a kind:1111 event with correct tags', () => {
    const event = buildComment('Great track!', trackId, provider);
    expect(event.kind).toBe(1111);
    expect(event.content).toBe('Great track!');
    expect(event.tags).toEqual([
      ['I', 'spotify:track:abc123', 'https://open.spotify.com/track/abc123'],
      ['k', '1111']
    ]);
  });

  it('should work with episode content', () => {
    const event = buildComment('Nice episode', episodeId, provider);
    expect(event.kind).toBe(1111);
    expect(event.tags![0]).toEqual([
      'I',
      'spotify:episode:ep456',
      'https://open.spotify.com/episode/ep456'
    ]);
  });

  it('should preserve empty content', () => {
    const event = buildComment('', trackId, provider);
    expect(event.content).toBe('');
  });

  it('should preserve content with special characters', () => {
    const content = '日本語テスト 🎵 <script>alert("xss")</script>';
    const event = buildComment(content, trackId, provider);
    expect(event.content).toBe(content);
  });

  it('should preserve multiline content', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const event = buildComment(content, trackId, provider);
    expect(event.content).toBe(content);
  });

  it('should always include k tag with value 1111', () => {
    const event = buildComment('test', trackId, provider);
    expect(event.tags).toContainEqual(['k', '1111']);
  });

  it('should include position tag in seconds when positionMs is provided', () => {
    const event = buildComment('At this moment!', trackId, provider, 65000);
    expect(event.tags).toContainEqual(['position', '65']);
  });

  it('should floor position to whole seconds', () => {
    const event = buildComment('partial', trackId, provider, 65999);
    expect(event.tags).toContainEqual(['position', '65']);
  });

  it('should not include position tag when positionMs is 0', () => {
    const event = buildComment('no position', trackId, provider, 0);
    const posTag = event.tags!.find((t) => t[0] === 'position');
    expect(posTag).toBeUndefined();
  });

  it('should not include position tag when positionMs is undefined', () => {
    const event = buildComment('no position', trackId, provider);
    const posTag = event.tags!.find((t) => t[0] === 'position');
    expect(posTag).toBeUndefined();
  });

  it('should include emoji tags when provided', () => {
    const emojiTags = [['emoji', 'sushi', 'https://example.com/sushi.png']];
    const event = buildComment('love :sushi:', trackId, provider, undefined, emojiTags);
    expect(event.tags).toContainEqual(['emoji', 'sushi', 'https://example.com/sushi.png']);
  });

  it('should not include emoji tags when not provided', () => {
    const event = buildComment('hello', trackId, provider);
    const emojiTag = event.tags!.find((t) => t[0] === 'emoji');
    expect(emojiTag).toBeUndefined();
  });
});

describe('formatPosition', () => {
  it('should format 0ms as 0:00', () => {
    expect(formatPosition(0)).toBe('0:00');
  });

  it('should format 65000ms as 1:05', () => {
    expect(formatPosition(65000)).toBe('1:05');
  });

  it('should format 3661000ms as 61:01', () => {
    expect(formatPosition(3661000)).toBe('61:01');
  });

  it('should floor partial seconds', () => {
    expect(formatPosition(999)).toBe('0:00');
    expect(formatPosition(1500)).toBe('0:01');
  });
});

describe('parsePosition', () => {
  it('should parse seconds string to milliseconds', () => {
    expect(parsePosition('65')).toBe(65000);
  });

  it('should parse 0 to 0', () => {
    expect(parsePosition('0')).toBe(0);
  });

  it('should parse large seconds value', () => {
    expect(parsePosition('3661')).toBe(3661000);
  });

  it('should parse legacy mm:ss format', () => {
    expect(parsePosition('1:05')).toBe(65000);
    expect(parsePosition('0:00')).toBe(0);
    expect(parsePosition('61:01')).toBe(3661000);
  });

  it('should return null for invalid format', () => {
    expect(parsePosition('abc')).toBeNull();
    expect(parsePosition('')).toBeNull();
    expect(parsePosition('1:5')).toBeNull();
    expect(parsePosition('1:005')).toBeNull();
  });
});

describe('extractHashtags', () => {
  it('should extract a single hashtag', () => {
    expect(extractHashtags('hello #world')).toEqual(['world']);
  });

  it('should extract multiple hashtags and deduplicate', () => {
    expect(extractHashtags('#foo #bar #Foo')).toEqual(['foo', 'bar']);
  });

  it('should extract Japanese hashtags', () => {
    expect(extractHashtags('#音楽 #ロック')).toEqual(['音楽', 'ロック']);
  });

  it('should ignore # in the middle of a word', () => {
    expect(extractHashtags('c#sharp')).toEqual([]);
  });

  it('should return empty array for no hashtags', () => {
    expect(extractHashtags('no hashtags here')).toEqual([]);
  });

  it('should handle hashtag at start of string', () => {
    expect(extractHashtags('#first word')).toEqual(['first']);
  });
});

describe('buildComment with hashtags', () => {
  it('should include t tags for hashtags in content', () => {
    const event = buildComment('#NowPlaying great song', trackId, provider);
    expect(event.tags).toContainEqual(['t', 'nowplaying']);
  });
});

describe('buildShare', () => {
  it('should build a kind:1 event with content as-is', () => {
    const text = 'Check this out!\nhttps://open.spotify.com/track/abc123';
    const event = buildShare(text, trackId, provider);
    expect(event.kind).toBe(1);
    expect(event.content).toBe(text);
    expect(event.tags).toEqual([
      ['I', 'spotify:track:abc123', 'https://open.spotify.com/track/abc123']
    ]);
  });

  it('should include I tag for episodes', () => {
    const event = buildShare('great episode', episodeId, provider);
    expect(event.tags).toContainEqual([
      'I',
      'spotify:episode:ep456',
      'https://open.spotify.com/episode/ep456'
    ]);
  });

  it('should include emoji tags when provided', () => {
    const emojiTags = [['emoji', 'fire', 'https://example.com/fire.png']];
    const event = buildShare(':fire: awesome', trackId, provider, emojiTags);
    expect(event.tags).toContainEqual(['emoji', 'fire', 'https://example.com/fire.png']);
  });

  it('should include t tags for hashtags', () => {
    const event = buildShare('#Music check this out', trackId, provider);
    expect(event.tags).toContainEqual(['t', 'music']);
  });
});

describe('buildReaction', () => {
  const targetEventId = 'event123abc';
  const targetPubkey = 'pubkey456def';

  it('should build a kind:7 event with default + reaction', () => {
    const event = buildReaction(targetEventId, targetPubkey, trackId, provider);
    expect(event.kind).toBe(7);
    expect(event.content).toBe('+');
    expect(event.tags).toEqual([
      ['e', 'event123abc'],
      ['p', 'pubkey456def'],
      ['I', 'spotify:track:abc123', 'https://open.spotify.com/track/abc123']
    ]);
  });

  it('should support custom reaction content', () => {
    const event = buildReaction(targetEventId, targetPubkey, trackId, provider, '🔥');
    expect(event.content).toBe('🔥');
  });

  it('should support "-" (dislike) reaction', () => {
    const event = buildReaction(targetEventId, targetPubkey, trackId, provider, '-');
    expect(event.content).toBe('-');
  });

  it('should include correct e and p tags', () => {
    const event = buildReaction(targetEventId, targetPubkey, trackId, provider);
    expect(event.tags![0]).toEqual(['e', targetEventId]);
    expect(event.tags![1]).toEqual(['p', targetPubkey]);
  });

  it('should include I tag matching the content', () => {
    const event = buildReaction(targetEventId, targetPubkey, episodeId, provider);
    expect(event.tags![2]).toEqual([
      'I',
      'spotify:episode:ep456',
      'https://open.spotify.com/episode/ep456'
    ]);
  });

  it('should add emoji tag for custom emoji reaction with :shortcode: format', () => {
    const event = buildReaction(
      targetEventId,
      targetPubkey,
      trackId,
      provider,
      ':sushi:',
      'https://example.com/sushi.png'
    );
    expect(event.content).toBe(':sushi:');
    expect(event.tags).toContainEqual(['emoji', 'sushi', 'https://example.com/sushi.png']);
  });

  it('should not add emoji tag when emojiUrl is undefined', () => {
    const event = buildReaction(targetEventId, targetPubkey, trackId, provider, ':sushi:');
    const emojiTag = event.tags!.find((t) => t[0] === 'emoji');
    expect(emojiTag).toBeUndefined();
  });

  it('should not add emoji tag when content is not :shortcode: format', () => {
    const event = buildReaction(
      targetEventId,
      targetPubkey,
      trackId,
      provider,
      '🔥',
      'https://example.com/fire.png'
    );
    const emojiTag = event.tags!.find((t) => t[0] === 'emoji');
    expect(emojiTag).toBeUndefined();
  });
});

describe('buildDeletion', () => {
  it('should build a kind:5 event with e tags', () => {
    const event = buildDeletion(['event1', 'event2']);
    expect(event.kind).toBe(5);
    expect(event.content).toBe('');
    expect(event.tags).toEqual([
      ['e', 'event1'],
      ['e', 'event2']
    ]);
  });

  it('should handle a single event id', () => {
    const event = buildDeletion(['event1']);
    expect(event.tags).toEqual([['e', 'event1']]);
  });

  it('should handle empty array', () => {
    const event = buildDeletion([]);
    expect(event.kind).toBe(5);
    expect(event.tags).toEqual([]);
  });
});
