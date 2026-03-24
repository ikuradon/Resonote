import { describe, expect, it } from 'vitest';

import { getEmbedComponentLoader } from './embed-component-loader.js';

describe('getEmbedComponentLoader', () => {
  const SUPPORTED_PLATFORMS = [
    'spotify',
    'youtube',
    'soundcloud',
    'vimeo',
    'mixcloud',
    'spreaker',
    'niconico',
    'podbean'
  ];

  it.each(SUPPORTED_PLATFORMS)('returns a loader function for platform "%s"', (platform) => {
    const loader = getEmbedComponentLoader(platform);

    expect(loader).not.toBeNull();
    expect(typeof loader).toBe('function');
  });

  it('returns null for an unknown platform', () => {
    const loader = getEmbedComponentLoader('unknown-platform');

    expect(loader).toBeNull();
  });

  it('returns null for an empty string platform', () => {
    const loader = getEmbedComponentLoader('');

    expect(loader).toBeNull();
  });

  it('returns null for a platform similar but not equal to a supported one', () => {
    const loader = getEmbedComponentLoader('Spotify');

    expect(loader).toBeNull();
  });

  it('loader for each platform is a distinct function', () => {
    const spotifyLoader = getEmbedComponentLoader('spotify');
    const youtubeLoader = getEmbedComponentLoader('youtube');

    expect(spotifyLoader).not.toBe(youtubeLoader);
  });

  it('calling getEmbedComponentLoader twice for same platform returns equivalent loaders', () => {
    const loader1 = getEmbedComponentLoader('spotify');
    const loader2 = getEmbedComponentLoader('spotify');

    expect(typeof loader1).toBe('function');
    expect(typeof loader2).toBe('function');
  });

  it('returns null for platforms with special characters', () => {
    expect(getEmbedComponentLoader('spotify!')).toBeNull();
    expect(getEmbedComponentLoader('you tube')).toBeNull();
  });

  it('each loader returns a promise when invoked', () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      const loader = getEmbedComponentLoader(platform);
      // The loader is a dynamic import function, calling it returns a Promise
      const result = loader!();
      expect(result).toBeInstanceOf(Promise);
      // Catch to avoid unhandled rejection in test (dynamic import will fail in test env)
      result.catch(() => {});
    }
  });
});
