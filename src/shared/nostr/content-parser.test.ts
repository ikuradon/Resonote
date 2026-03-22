import { describe, it, expect } from 'vitest';
import { containsPrivateKey, parseCommentContent, extractContentTags } from './content-parser.js';
import { npubEncode, neventEncode, nprofileEncode, noteEncode } from 'nostr-tools/nip19';
import { encodeContentLink } from './helpers.js';

// Valid test pubkey (64 hex chars)
const PUBKEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const EVENT_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

const VALID_NPUB = npubEncode(PUBKEY_HEX);
const VALID_NOTE = noteEncode(EVENT_HEX);
const VALID_NEVENT = neventEncode({ id: EVENT_HEX, relays: [], author: PUBKEY_HEX });
const VALID_NPROFILE = nprofileEncode({ pubkey: PUBKEY_HEX, relays: [] });

const SPOTIFY_CONTENT_ID = { platform: 'spotify', type: 'track', id: '4uLU6hMCjMI75M1A2tKUQC' };
const VALID_NCONTENT = encodeContentLink(SPOTIFY_CONTENT_ID, []);

// --- containsPrivateKey ---

describe('containsPrivateKey', () => {
  it('returns true for nsec1 + 58 lowercase chars', () => {
    const nsec = 'nsec1' + 'a'.repeat(58);
    expect(containsPrivateKey(nsec)).toBe(true);
  });

  it('returns true when nsec1 is embedded in text', () => {
    const nsec = 'nsec1' + 'b'.repeat(58);
    expect(containsPrivateKey(`my key is ${nsec} please ignore`)).toBe(true);
  });

  it('returns false for nsec1 + 57 chars (too short)', () => {
    const nsec = 'nsec1' + 'a'.repeat(57);
    expect(containsPrivateKey(nsec)).toBe(false);
  });

  it('returns false when there is no nsec', () => {
    expect(containsPrivateKey('hello world')).toBe(false);
  });

  it('returns false for "nsec" without the 1', () => {
    expect(containsPrivateKey('nsec' + 'a'.repeat(62))).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(containsPrivateKey('')).toBe(false);
  });

  it('detects uppercase NSEC1 (bech32 allows upper case)', () => {
    const nsec = 'NSEC1' + 'A'.repeat(58);
    expect(containsPrivateKey(nsec)).toBe(true);
  });

  it('detects mixed case nsec1', () => {
    const nsec = 'Nsec1' + 'aB'.repeat(29);
    expect(containsPrivateKey(nsec)).toBe(true);
  });
});

// --- parseCommentContent ---

describe('parseCommentContent — basic', () => {
  it('returns single text segment for plain text', () => {
    const result = parseCommentContent('hello world', []);
    expect(result).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('returns empty array for empty string', () => {
    const result = parseCommentContent('', []);
    expect(result).toEqual([]);
  });
});

describe('parseCommentContent — emoji', () => {
  const emojiTags = [['emoji', 'sushi', 'https://example.com/sushi.png']];

  it('converts matching emoji shortcode to emoji segment', () => {
    const result = parseCommentContent('I love :sushi:', emojiTags);
    const emojiSeg = result.find((s) => s.type === 'emoji');
    expect(emojiSeg).toEqual({
      type: 'emoji',
      shortcode: 'sushi',
      url: 'https://example.com/sushi.png'
    });
  });

  it('leaves unmatched shortcode as text', () => {
    const result = parseCommentContent(':unknown:', emojiTags);
    expect(result).toEqual([{ type: 'text', value: ':unknown:' }]);
  });

  it('leaves shortcode as text when no emoji tags', () => {
    const result = parseCommentContent(':sushi:', []);
    expect(result).toEqual([{ type: 'text', value: ':sushi:' }]);
  });
});

describe('parseCommentContent — nostr URIs', () => {
  it('converts nostr:npub1... to nostr-link segment with /profile/ href', () => {
    const result = parseCommentContent(`nostr:${VALID_NPUB}`, []);
    const seg = result.find((s) => s.type === 'nostr-link');
    expect(seg).toBeDefined();
    if (seg?.type === 'nostr-link') {
      expect(seg.href).toBe(`/profile/${VALID_NPUB}`);
      expect(seg.decoded.type).toBe('npub');
    }
  });

  it('converts nostr:nprofile1... to nostr-link with /profile/ href', () => {
    const result = parseCommentContent(`nostr:${VALID_NPROFILE}`, []);
    const seg = result.find((s) => s.type === 'nostr-link');
    expect(seg).toBeDefined();
    if (seg?.type === 'nostr-link') {
      expect(seg.href).toContain('/profile/');
    }
  });

  it('converts nostr:note1... to nostr-link with /<uri> href', () => {
    const result = parseCommentContent(`nostr:${VALID_NOTE}`, []);
    const seg = result.find((s) => s.type === 'nostr-link');
    expect(seg).toBeDefined();
    if (seg?.type === 'nostr-link') {
      expect(seg.href).toBe(`/${VALID_NOTE}`);
    }
  });

  it('converts nostr:nevent1... to nostr-link segment', () => {
    const result = parseCommentContent(`nostr:${VALID_NEVENT}`, []);
    const seg = result.find((s) => s.type === 'nostr-link');
    expect(seg).toBeDefined();
    if (seg?.type === 'nostr-link') {
      expect(seg.decoded.type).toBe('nevent');
    }
  });

  it('converts nostr:ncontent1... to content-link segment', () => {
    const result = parseCommentContent(`nostr:${VALID_NCONTENT}`, []);
    const seg = result.find((s) => s.type === 'content-link');
    expect(seg).toBeDefined();
    if (seg?.type === 'content-link') {
      expect(seg.contentId.platform).toBe('spotify');
      expect(seg.contentId.type).toBe('track');
      expect(seg.displayLabel).toBe('Spotify');
      expect(seg.href).toContain('/spotify/track/');
    }
  });

  it('renders nsec1... as plain text (NOT linked)', () => {
    const nsecLike = 'nsec1' + 'a'.repeat(58);
    const result = parseCommentContent(nsecLike, []);
    expect(result.every((s) => s.type === 'text')).toBe(true);
    const joined = result.map((s) => (s.type === 'text' ? s.value : '')).join('');
    expect(joined).toContain('nsec1');
  });

  it('renders nostr: URI with invalid bech32 as text', () => {
    const result = parseCommentContent('nostr:npub1invalidxyz', []);
    const hasNostrLink = result.some((s) => s.type === 'nostr-link');
    expect(hasNostrLink).toBe(false);
  });
});

describe('parseCommentContent — URLs', () => {
  it('converts https URL to url segment', () => {
    const result = parseCommentContent('Check https://example.com', []);
    const seg = result.find((s) => s.type === 'url');
    expect(seg).toBeDefined();
    if (seg?.type === 'url') {
      expect(seg.href).toBe('https://example.com');
    }
  });

  it('converts http URL to url segment', () => {
    const result = parseCommentContent('http://example.com', []);
    const seg = result.find((s) => s.type === 'url');
    expect(seg?.type).toBe('url');
  });

  it('trims trailing dot from URL', () => {
    const result = parseCommentContent('Visit https://example.com/path.', []);
    const seg = result.find((s) => s.type === 'url');
    if (seg?.type === 'url') {
      expect(seg.href).toBe('https://example.com/path');
    }
  });

  it('trims trailing ) from URL', () => {
    const result = parseCommentContent('(see https://example.com/page)', []);
    const seg = result.find((s) => s.type === 'url');
    if (seg?.type === 'url') {
      expect(seg.href).toBe('https://example.com/page');
    }
  });

  it('preserves balanced parentheses in URL (Wikipedia style)', () => {
    const result = parseCommentContent('https://en.wikipedia.org/wiki/Nostr_(protocol)', []);
    const seg = result.find((s) => s.type === 'url');
    if (seg?.type === 'url') {
      expect(seg.href).toBe('https://en.wikipedia.org/wiki/Nostr_(protocol)');
    } else {
      expect.fail('Expected url segment');
    }
  });

  it('trims ) after balanced URL in parenthetical text', () => {
    const result = parseCommentContent('(see https://en.wikipedia.org/wiki/Nostr_(protocol))', []);
    const seg = result.find((s) => s.type === 'url');
    if (seg?.type === 'url') {
      // The URL has balanced parens, but the outer ) is not part of it
      expect(seg.href).toBe('https://en.wikipedia.org/wiki/Nostr_(protocol)');
    } else {
      expect.fail('Expected url segment');
    }
  });

  it('nostr: URI is not mistaken for a URL', () => {
    const result = parseCommentContent(`nostr:${VALID_NPUB}`, []);
    const urlSeg = result.find((s) => s.type === 'url');
    expect(urlSeg).toBeUndefined();
  });
});

describe('parseCommentContent — hashtags', () => {
  it('converts #music to hashtag segment', () => {
    const result = parseCommentContent('Listen #music', []);
    const seg = result.find((s) => s.type === 'hashtag');
    expect(seg).toBeDefined();
    if (seg?.type === 'hashtag') {
      expect(seg.tag).toBe('music');
    }
  });

  it('converts Japanese hashtag to hashtag segment', () => {
    const result = parseCommentContent('#ノストル', []);
    const seg = result.find((s) => s.type === 'hashtag');
    expect(seg?.type).toBe('hashtag');
    if (seg?.type === 'hashtag') {
      expect(seg.tag).toBe('ノストル');
    }
  });

  it('does NOT treat # + 64 hex chars as hashtag', () => {
    const hex64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const result = parseCommentContent(`#${hex64}`, []);
    const hashSeg = result.find((s) => s.type === 'hashtag');
    expect(hashSeg).toBeUndefined();
  });

  it('does NOT treat # + digits only as hashtag', () => {
    const result = parseCommentContent('#123', []);
    const hashSeg = result.find((s) => s.type === 'hashtag');
    expect(hashSeg).toBeUndefined();
  });
});

describe('parseCommentContent — mixed content', () => {
  it('handles text + emoji + URL + hashtag', () => {
    const emojiTags = [['emoji', 'fire', 'https://example.com/fire.png']];
    const content = 'Hello :fire: see https://example.com and #music';
    const result = parseCommentContent(content, emojiTags);
    const types = result.map((s) => s.type);
    expect(types).toContain('text');
    expect(types).toContain('emoji');
    expect(types).toContain('url');
    expect(types).toContain('hashtag');
  });

  it('handles nostr link + text', () => {
    const content = `Follow nostr:${VALID_NPUB} for updates`;
    const result = parseCommentContent(content, []);
    const types = result.map((s) => s.type);
    expect(types).toContain('nostr-link');
    expect(types).toContain('text');
  });

  it('handles adjacent segments without gaps', () => {
    const emojiTags = [['emoji', 'star', 'https://example.com/star.png']];
    const content = ':star::star:';
    const result = parseCommentContent(content, emojiTags);
    const emojiSegs = result.filter((s) => s.type === 'emoji');
    expect(emojiSegs).toHaveLength(2);
  });
});

// --- extractContentTags ---

describe('extractContentTags', () => {
  it('extracts hex pubkey from nostr:npub1... to pTags', () => {
    const { pTags } = extractContentTags(`nostr:${VALID_NPUB}`);
    expect(pTags).toHaveLength(1);
    expect(pTags[0]).toBe(PUBKEY_HEX);
  });

  it('extracts hex pubkey from nostr:nprofile1... to pTags', () => {
    const { pTags } = extractContentTags(`mention nostr:${VALID_NPROFILE}`);
    expect(pTags).toHaveLength(1);
    expect(pTags[0]).toBe(PUBKEY_HEX);
  });

  it('extracts eventId from nostr:nevent1... to eTags', () => {
    const { eTags } = extractContentTags(`nostr:${VALID_NEVENT}`);
    expect(eTags).toHaveLength(1);
    expect(eTags[0]).toBe(EVENT_HEX);
  });

  it('extracts eventId from nostr:note1... to eTags', () => {
    const { eTags } = extractContentTags(`nostr:${VALID_NOTE}`);
    expect(eTags).toHaveLength(1);
    expect(eTags[0]).toBe(EVENT_HEX);
  });

  it('extracts lowercase hashtag to tTags', () => {
    const { tTags } = extractContentTags('#Music');
    expect(tTags).toContain('music');
  });

  it('deduplicates pTags', () => {
    const { pTags } = extractContentTags(`nostr:${VALID_NPUB} nostr:${VALID_NPUB}`);
    expect(pTags).toHaveLength(1);
  });

  it('deduplicates tTags', () => {
    const { tTags } = extractContentTags('#music #Music #MUSIC');
    expect(tTags).toHaveLength(1);
  });

  it('returns empty arrays for plain text', () => {
    const { pTags, eTags, tTags } = extractContentTags('no links here');
    expect(pTags).toHaveLength(0);
    expect(eTags).toHaveLength(0);
    expect(tTags).toHaveLength(0);
  });

  it('does not generate tags from nostr:ncontent1...', () => {
    const { pTags, eTags } = extractContentTags(`nostr:${VALID_NCONTENT}`);
    expect(pTags).toHaveLength(0);
    expect(eTags).toHaveLength(0);
  });

  it('does not generate tags from nostr:nsec1...', () => {
    const nsecLike = 'nsec1' + 'a'.repeat(58);
    const { pTags, eTags } = extractContentTags(nsecLike);
    expect(pTags).toHaveLength(0);
    expect(eTags).toHaveLength(0);
  });

  it('does not treat #<64 hex chars> as hashtag', () => {
    const hex64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const { tTags } = extractContentTags(`#${hex64}`);
    expect(tTags).toHaveLength(0);
  });

  it('does not treat #<digits only> as hashtag', () => {
    const { tTags } = extractContentTags('#123');
    expect(tTags).toHaveLength(0);
  });
});
