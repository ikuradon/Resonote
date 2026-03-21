import { describe, it, expect } from 'vitest';
import { niconico } from '$shared/content/niconico.js';

describe('NiconicoProvider.parseUrl', () => {
  it('should parse sm prefix nicovideo.jp URL', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('should parse so prefix nicovideo.jp URL', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/so12345');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'so12345' });
  });

  it('should parse nico.ms short URL', () => {
    const result = niconico.parseUrl('https://nico.ms/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('should parse embed.nicovideo.jp URL', () => {
    const result = niconico.parseUrl('https://embed.nicovideo.jp/watch/sm9?jsapi=1&playerId=1');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('should parse sp.nicovideo.jp URL', () => {
    const result = niconico.parseUrl('https://sp.nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('should parse http URL', () => {
    const result = niconico.parseUrl('http://www.nicovideo.jp/watch/sm12345');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm12345' });
  });

  it('should strip query params (?from=30)', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/sm9?from=30');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('should reject nm prefix', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/nm12345');
    expect(result).toBeNull();
  });

  it('should reject non-niconico URL', () => {
    const result = niconico.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toBeNull();
  });

  it('should reject nicovideo.jp URL without valid prefix', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/user/12345');
    expect(result).toBeNull();
  });
});

describe('NiconicoProvider.toNostrTag', () => {
  it('should return correct NIP-73 tag', () => {
    const contentId = { platform: 'niconico', type: 'video', id: 'sm9' };
    const tag = niconico.toNostrTag(contentId);
    expect(tag).toEqual(['niconico:video:sm9', 'https://www.nicovideo.jp/watch/sm9']);
  });
});

describe('NiconicoProvider.contentKind', () => {
  it('should return niconico:video', () => {
    const contentId = { platform: 'niconico', type: 'video', id: 'sm9' };
    expect(niconico.contentKind(contentId)).toBe('niconico:video');
  });
});

describe('NiconicoProvider.embedUrl', () => {
  it('should return embed URL with jsapi and playerId params', () => {
    const contentId = { platform: 'niconico', type: 'video', id: 'sm9' };
    expect(niconico.embedUrl(contentId)).toBe(
      'https://embed.nicovideo.jp/watch/sm9?jsapi=1&playerId=1'
    );
  });
});

describe('NiconicoProvider.openUrl', () => {
  it('should return nicovideo.jp watch URL', () => {
    const contentId = { platform: 'niconico', type: 'video', id: 'sm9' };
    expect(niconico.openUrl(contentId)).toBe('https://www.nicovideo.jp/watch/sm9');
  });
});
