import { describe, it, expect } from 'vitest';
import { MixcloudProvider } from './mixcloud.js';

const provider = new MixcloudProvider();

describe('MixcloudProvider.parseUrl', () => {
  it('parses standard URL with trailing slash', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/djuser/awesome-mix/')).toEqual({
      platform: 'mixcloud',
      type: 'mix',
      id: 'djuser/awesome-mix'
    });
  });

  it('parses URL without trailing slash', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/djuser/awesome-mix')).toEqual({
      platform: 'mixcloud',
      type: 'mix',
      id: 'djuser/awesome-mix'
    });
  });

  it('parses URL with www prefix', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/someuser/some-mix/')).toEqual({
      platform: 'mixcloud',
      type: 'mix',
      id: 'someuser/some-mix'
    });
  });

  it('parses URL with query params', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/djuser/awesome-mix/?autoplay=1')).toEqual({
      platform: 'mixcloud',
      type: 'mix',
      id: 'djuser/awesome-mix'
    });
  });

  it('returns null for reserved path: discover', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/discover/jazz/')).toBeNull();
  });

  it('returns null for reserved path: upload', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/upload/something/')).toBeNull();
  });

  it('returns null for reserved path: dashboard', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/dashboard/something/')).toBeNull();
  });

  it('returns null for reserved path: settings', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/settings/something/')).toBeNull();
  });

  it('returns null for non-Mixcloud URL', () => {
    expect(provider.parseUrl('https://www.soundcloud.com/djuser/track')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('returns null for user-only URL (single segment)', () => {
    // Regex requires 2 segments, so single segment returns null
    expect(provider.parseUrl('https://www.mixcloud.com/djuser/')).toBeNull();
  });
});

describe('MixcloudProvider.toNostrTag', () => {
  it('returns correct NIP-73 tag', () => {
    const contentId = { platform: 'mixcloud', type: 'mix', id: 'djuser/awesome-mix' };
    expect(provider.toNostrTag(contentId)).toEqual([
      'mixcloud:djuser/awesome-mix',
      'https://www.mixcloud.com/djuser/awesome-mix/'
    ]);
  });
});

describe('MixcloudProvider.contentKind', () => {
  it('returns mixcloud:mix', () => {
    expect(provider.contentKind()).toBe('mixcloud:mix');
  });
});

describe('MixcloudProvider.embedUrl', () => {
  it('returns correct embed URL', () => {
    const contentId = { platform: 'mixcloud', type: 'mix', id: 'djuser/awesome-mix' };
    const feed = encodeURIComponent('/djuser/awesome-mix/');
    expect(provider.embedUrl(contentId)).toBe(
      `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${feed}`
    );
  });
});

describe('MixcloudProvider.openUrl', () => {
  it('returns correct open URL', () => {
    const contentId = { platform: 'mixcloud', type: 'mix', id: 'djuser/awesome-mix' };
    expect(provider.openUrl(contentId)).toBe('https://www.mixcloud.com/djuser/awesome-mix/');
  });
});
