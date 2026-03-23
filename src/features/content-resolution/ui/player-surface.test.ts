import { describe, expect, it } from 'vitest';
import { resolvePlayerSurface } from '$features/content-resolution/ui/player-surface.js';

describe('resolvePlayerSurface', () => {
  it('should treat podcast feeds as a feed surface', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'podcast', type: 'feed', id: 'feed' },
        requiresExtension: false,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'podcast-feed' });
  });

  it('should treat audio and podcast episodes as audio surfaces', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'audio', type: 'track', id: 'audio' },
        requiresExtension: false,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'audio' });

    expect(
      resolvePlayerSurface({
        contentId: { platform: 'podcast', type: 'episode', id: 'ep' },
        requiresExtension: false,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'audio' });
  });

  it('should treat youtube playlists as youtube-feed surface', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'youtube', type: 'playlist', id: 'PLxxxx' },
        requiresExtension: false,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'youtube-feed' });
  });

  it('should treat youtube channels as youtube-feed surface', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'youtube', type: 'channel', id: 'UCxxxx' },
        requiresExtension: false,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'youtube-feed' });
  });

  it('should suppress external embed players in extension mode', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'youtube', type: 'video', id: 'abc' },
        requiresExtension: false,
        extensionMode: true,
        extensionAvailable: true
      })
    ).toEqual({ kind: 'none' });
  });

  it('should choose extension install/open surfaces for extension-only providers', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'netflix', type: 'title', id: 'abc' },
        requiresExtension: true,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'install-extension' });

    expect(
      resolvePlayerSurface({
        contentId: { platform: 'netflix', type: 'title', id: 'abc' },
        requiresExtension: true,
        extensionMode: false,
        extensionAvailable: true
      })
    ).toEqual({ kind: 'open-extension' });
  });

  it('should choose embed surfaces for supported non-extension platforms', () => {
    expect(
      resolvePlayerSurface({
        contentId: { platform: 'spotify', type: 'show', id: 'abc' },
        requiresExtension: false,
        extensionMode: false,
        extensionAvailable: false
      })
    ).toEqual({ kind: 'embed' });
  });
});
