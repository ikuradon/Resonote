import { describe, expect, it } from 'vitest';
import { buildDefaultShareContent, buildResonoteShareUrl } from './share-link.js';

describe('buildDefaultShareContent', () => {
  it('should combine source and page URLs on separate lines', () => {
    expect(
      buildDefaultShareContent(
        'https://open.spotify.com/track/abc',
        'https://resonote.app/spotify/track/abc'
      )
    ).toBe('https://open.spotify.com/track/abc\nhttps://resonote.app/spotify/track/abc');
  });
});

describe('buildResonoteShareUrl', () => {
  const contentId = { platform: 'spotify', type: 'track', id: 'abc' } as const;
  const relays = ['wss://relay.example.com'];

  it('should build a base resonote URL', () => {
    const url = buildResonoteShareUrl('https://resonote.app', contentId, relays);
    expect(url.startsWith('https://resonote.app/')).toBe(true);
    expect(url.includes('?t=')).toBe(false);
  });

  it('should append a timestamp when one is provided', () => {
    const url = buildResonoteShareUrl('https://resonote.app', contentId, relays, 65);
    expect(url.endsWith('?t=65')).toBe(true);
  });

  it('should skip non-positive timestamps', () => {
    expect(buildResonoteShareUrl('https://resonote.app', contentId, relays, 0)).not.toContain(
      '?t='
    );
  });
});
