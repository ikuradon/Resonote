/**
 * Comprehensive cross-provider tests.
 *
 * Each provider section verifies:
 *   1. parseUrl with a valid URL → returns ContentId
 *   2. parseUrl with an invalid URL → returns null
 *   3. toNostrTag returns the correct NIP-73 [value, hint] tuple
 *   4. contentKind returns the correct kind string
 *   5. toNostrTag()[0] value prefix matches contentKind() return value
 *      (except AudioProvider, whose tag value embeds the raw URL rather than the id)
 */
import { describe, expect, it } from 'vitest';

import { AbemaProvider } from '$shared/content/abema.js';
import { AppleMusicProvider } from '$shared/content/apple-music.js';
import { AudioProvider } from '$shared/content/audio.js';
import { DisneyPlusProvider } from '$shared/content/disney-plus.js';
import { FountainFmProvider } from '$shared/content/fountain-fm.js';
import { MixcloudProvider } from '$shared/content/mixcloud.js';
import { NetflixProvider } from '$shared/content/netflix.js';
import { NiconicoProvider } from '$shared/content/niconico.js';
import { PodbeanProvider } from '$shared/content/podbean.js';
import { buildEpisodeContentId, PodcastProvider } from '$shared/content/podcast.js';
import { PrimeVideoProvider } from '$shared/content/prime-video.js';
import { SoundCloudProvider } from '$shared/content/soundcloud.js';
import { SpotifyProvider } from '$shared/content/spotify.js';
import { SpreakerProvider } from '$shared/content/spreaker.js';
import { TVerProvider } from '$shared/content/tver.js';
import { UNextProvider } from '$shared/content/u-next.js';
import { toBase64url } from '$shared/content/url-utils.js';
import { VimeoProvider } from '$shared/content/vimeo.js';
import { YouTubeProvider } from '$shared/content/youtube.js';

// ---------------------------------------------------------------------------
// SpotifyProvider
// ---------------------------------------------------------------------------
describe('SpotifyProvider', () => {
  const provider = new SpotifyProvider();

  it('parseUrl: valid track URL returns ContentId', () => {
    expect(provider.parseUrl('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA')).toEqual({
      platform: 'spotify',
      type: 'track',
      id: '4C6zDr6e86HYqLxPAhO8jA'
    });
  });

  it('parseUrl: valid episode URL returns ContentId', () => {
    expect(provider.parseUrl('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA')).toEqual({
      platform: 'spotify',
      type: 'episode',
      id: '4C6zDr6e86HYqLxPAhO8jA'
    });
  });

  it('parseUrl: valid Spotify URI returns ContentId', () => {
    expect(provider.parseUrl('spotify:track:abc123')).toEqual({
      platform: 'spotify',
      type: 'track',
      id: 'abc123'
    });
  });

  it('parseUrl: non-Spotify URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('parseUrl: unsupported type (playlist) returns null', () => {
    expect(
      provider.parseUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
    ).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'spotify', type: 'track', id: 'abc123' })).toEqual([
      'spotify:track:abc123',
      'https://open.spotify.com/track/abc123'
    ]);
  });

  it('contentKind: returns "spotify:track"', () => {
    expect(provider.contentKind({ platform: 'spotify', type: 'track', id: 'abc123' })).toBe(
      'spotify:track'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'spotify', type: 'track', id: 'abc123' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// YouTubeProvider
// ---------------------------------------------------------------------------
describe('YouTubeProvider', () => {
  const provider = new YouTubeProvider();

  it('parseUrl: watch URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      platform: 'youtube',
      type: 'video',
      id: 'dQw4w9WgXcQ'
    });
  });

  it('parseUrl: youtu.be short URL returns ContentId', () => {
    expect(provider.parseUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      platform: 'youtube',
      type: 'video',
      id: 'dQw4w9WgXcQ'
    });
  });

  it('parseUrl: Shorts URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      platform: 'youtube',
      type: 'video',
      id: 'dQw4w9WgXcQ'
    });
  });

  it('parseUrl: non-YouTube URL returns null', () => {
    expect(provider.parseUrl('https://vimeo.com/123456789')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toEqual([
      'youtube:video:dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    ]);
  });

  it('contentKind: returns "youtube:video"', () => {
    expect(provider.contentKind({ platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' })).toBe(
      'youtube:video'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VimeoProvider
// ---------------------------------------------------------------------------
describe('VimeoProvider', () => {
  const provider = new VimeoProvider();

  it('parseUrl: vimeo.com URL returns ContentId', () => {
    expect(provider.parseUrl('https://vimeo.com/123456789')).toEqual({
      platform: 'vimeo',
      type: 'video',
      id: '123456789'
    });
  });

  it('parseUrl: player.vimeo.com embed URL returns ContentId', () => {
    expect(provider.parseUrl('https://player.vimeo.com/video/123456789')).toEqual({
      platform: 'vimeo',
      type: 'video',
      id: '123456789'
    });
  });

  it('parseUrl: non-Vimeo URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'vimeo', type: 'video', id: '123456789' })).toEqual([
      'vimeo:video:123456789',
      'https://vimeo.com/123456789'
    ]);
  });

  it('contentKind: returns "vimeo:video"', () => {
    expect(provider.contentKind({ platform: 'vimeo', type: 'video', id: '123456789' })).toBe(
      'vimeo:video'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'vimeo', type: 'video', id: '123456789' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SoundCloudProvider
// ---------------------------------------------------------------------------
describe('SoundCloudProvider', () => {
  const provider = new SoundCloudProvider();

  it('parseUrl: soundcloud.com track URL returns ContentId', () => {
    expect(provider.parseUrl('https://soundcloud.com/artist/trackname')).toEqual({
      platform: 'soundcloud',
      type: 'track',
      id: 'artist/trackname'
    });
  });

  it('parseUrl: URL with "sets" second segment returns null', () => {
    expect(provider.parseUrl('https://soundcloud.com/artist/sets')).toBeNull();
  });

  it('parseUrl: non-SoundCloud URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(
      provider.toNostrTag({ platform: 'soundcloud', type: 'track', id: 'artist/trackname' })
    ).toEqual(['soundcloud:track:artist/trackname', 'https://soundcloud.com/artist/trackname']);
  });

  it('contentKind: returns "soundcloud:track"', () => {
    expect(
      provider.contentKind({ platform: 'soundcloud', type: 'track', id: 'artist/trackname' })
    ).toBe('soundcloud:track');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'soundcloud', type: 'track', id: 'artist/trackname' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MixcloudProvider
// ---------------------------------------------------------------------------
describe('MixcloudProvider', () => {
  const provider = new MixcloudProvider();

  it('parseUrl: mixcloud.com mix URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/djname/mix-title/')).toEqual({
      platform: 'mixcloud',
      type: 'mix',
      id: 'djname/mix-title'
    });
  });

  it('parseUrl: reserved path "upload" returns null', () => {
    expect(provider.parseUrl('https://www.mixcloud.com/upload/something')).toBeNull();
  });

  it('parseUrl: non-Mixcloud URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(
      provider.toNostrTag({ platform: 'mixcloud', type: 'mix', id: 'djname/mix-title' })
    ).toEqual(['mixcloud:mix:djname/mix-title', 'https://www.mixcloud.com/djname/mix-title/']);
  });

  it('contentKind: returns "mixcloud:mix"', () => {
    const contentId = { platform: 'mixcloud', type: 'mix', id: 'djname/mix-title' };
    expect(provider.contentKind(contentId)).toBe('mixcloud:mix');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'mixcloud', type: 'mix', id: 'djname/mix-title' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SpreakerProvider
// ---------------------------------------------------------------------------
describe('SpreakerProvider', () => {
  const provider = new SpreakerProvider();

  it('parseUrl: spreaker.com episode URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.spreaker.com/episode/episode-slug--12345678')).toEqual({
      platform: 'spreaker',
      type: 'episode',
      id: '12345678'
    });
  });

  it('parseUrl: episode URL without slug returns ContentId', () => {
    expect(provider.parseUrl('https://www.spreaker.com/episode/12345678')).toEqual({
      platform: 'spreaker',
      type: 'episode',
      id: '12345678'
    });
  });

  it('parseUrl: non-Spreaker URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'spreaker', type: 'episode', id: '12345678' })).toEqual([
      'spreaker:episode:12345678',
      'https://www.spreaker.com/episode/12345678'
    ]);
  });

  it('contentKind: returns "spreaker:episode"', () => {
    expect(provider.contentKind({ platform: 'spreaker', type: 'episode', id: '12345678' })).toBe(
      'spreaker:episode'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'spreaker', type: 'episode', id: '12345678' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NiconicoProvider
// ---------------------------------------------------------------------------
describe('NiconicoProvider', () => {
  const provider = new NiconicoProvider();

  it('parseUrl: nicovideo.jp URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.nicovideo.jp/watch/sm12345678')).toEqual({
      platform: 'niconico',
      type: 'video',
      id: 'sm12345678'
    });
  });

  it('parseUrl: nico.ms short URL returns ContentId', () => {
    expect(provider.parseUrl('https://nico.ms/sm12345678')).toEqual({
      platform: 'niconico',
      type: 'video',
      id: 'sm12345678'
    });
  });

  it('parseUrl: embed.nicovideo.jp URL returns ContentId', () => {
    expect(provider.parseUrl('https://embed.nicovideo.jp/watch/sm12345678')).toEqual({
      platform: 'niconico',
      type: 'video',
      id: 'sm12345678'
    });
  });

  it('parseUrl: non-Niconico URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'niconico', type: 'video', id: 'sm12345678' })).toEqual([
      'niconico:video:sm12345678',
      'https://www.nicovideo.jp/watch/sm12345678'
    ]);
  });

  it('contentKind: returns "niconico:video"', () => {
    expect(provider.contentKind({ platform: 'niconico', type: 'video', id: 'sm12345678' })).toBe(
      'niconico:video'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'niconico', type: 'video', id: 'sm12345678' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PodbeanProvider
// ---------------------------------------------------------------------------
describe('PodbeanProvider', () => {
  const provider = new PodbeanProvider();

  it('parseUrl: media/share URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.podbean.com/media/share/pb-abc12-def456')).toEqual({
      platform: 'podbean',
      type: 'episode',
      id: 'pb-abc12-def456'
    });
  });

  it('parseUrl: ew URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.podbean.com/ew/pb-abc12-def456')).toEqual({
      platform: 'podbean',
      type: 'episode',
      id: 'pb-abc12-def456'
    });
  });

  it('parseUrl: channel subdomain URL returns ContentId', () => {
    expect(provider.parseUrl('https://mypodcast.podbean.com/e/episode-slug')).toEqual({
      platform: 'podbean',
      type: 'episode',
      id: 'mypodcast/episode-slug'
    });
  });

  it('parseUrl: non-Podbean URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag for pb- id', () => {
    expect(
      provider.toNostrTag({ platform: 'podbean', type: 'episode', id: 'pb-abc12-def456' })
    ).toEqual([
      'podbean:episode:pb-abc12-def456',
      'https://www.podbean.com/media/share/pb-abc12-def456'
    ]);
  });

  it('contentKind: returns "podbean:episode"', () => {
    expect(
      provider.contentKind({ platform: 'podbean', type: 'episode', id: 'pb-abc12-def456' })
    ).toBe('podbean:episode');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'podbean', type: 'episode', id: 'pb-abc12-def456' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AudioProvider
// toNostrTag value format: `audio:track:<rawUrl>` (NIP-73 platform:type:id)
// ---------------------------------------------------------------------------
describe('AudioProvider', () => {
  const provider = new AudioProvider();
  const audioUrl = 'https://example.com/episode.mp3';
  const audioId = toBase64url(audioUrl);

  it('parseUrl: .mp3 URL returns ContentId with base64url id', () => {
    expect(provider.parseUrl(audioUrl)).toEqual({
      platform: 'audio',
      type: 'track',
      id: audioId
    });
  });

  it('parseUrl: non-audio extension URL returns null', () => {
    expect(provider.parseUrl('https://example.com/page.html')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns [audio:track:<url>, <url>]', () => {
    const contentId = { platform: 'audio', type: 'track', id: audioId };
    expect(provider.toNostrTag(contentId)).toEqual([`audio:track:${audioUrl}`, audioUrl]);
  });

  it('contentKind: returns "audio:track"', () => {
    const contentId = { platform: 'audio', type: 'track', id: audioId };
    expect(provider.contentKind(contentId)).toBe('audio:track');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'audio', type: 'track', id: audioId };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PodcastProvider
// ---------------------------------------------------------------------------
describe('PodcastProvider', () => {
  const provider = new PodcastProvider();
  const feedUrl = 'https://example.com/feed.rss';
  const feedId = toBase64url(feedUrl);

  it('parseUrl: .rss URL returns feed ContentId', () => {
    expect(provider.parseUrl(feedUrl)).toEqual({
      platform: 'podcast',
      type: 'feed',
      id: feedId
    });
  });

  it('parseUrl: /feed path segment URL returns feed ContentId', () => {
    const url = 'https://example.com/podcast/feed';
    expect(provider.parseUrl(url)).toEqual({
      platform: 'podcast',
      type: 'feed',
      id: toBase64url(url)
    });
  });

  it('parseUrl: non-feed URL returns null', () => {
    expect(provider.parseUrl('https://example.com/page.html')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag (feed): returns [podcast:feed:<feedUrl>, <feedUrl>]', () => {
    const contentId = { platform: 'podcast', type: 'feed', id: feedId };
    expect(provider.toNostrTag(contentId)).toEqual([`podcast:feed:${feedUrl}`, feedUrl]);
  });

  it('toNostrTag (episode): returns [podcast:item:guid:<guid>, <feedUrl>]', () => {
    const guid = 'episode-guid-abc';
    const contentId = buildEpisodeContentId(feedUrl, guid);
    expect(provider.toNostrTag(contentId)).toEqual([`podcast:item:guid:${guid}`, feedUrl]);
  });

  it('contentKind: returns "podcast:feed" for feed type', () => {
    const contentId = { platform: 'podcast', type: 'feed', id: feedId };
    expect(provider.contentKind(contentId)).toBe('podcast:feed');
  });

  it('contentKind: returns "podcast:item:guid" for episode type', () => {
    const contentId = buildEpisodeContentId(feedUrl, 'guid-xyz');
    expect(provider.contentKind(contentId)).toBe('podcast:item:guid');
  });

  it('toNostrTag()[0] prefix matches contentKind() for feed', () => {
    const contentId = { platform: 'podcast', type: 'feed', id: feedId };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });

  it('toNostrTag()[0] prefix matches contentKind() for episode', () => {
    const contentId = buildEpisodeContentId(feedUrl, 'guid-xyz');
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NetflixProvider
// ---------------------------------------------------------------------------
describe('NetflixProvider', () => {
  const provider = new NetflixProvider();

  it('parseUrl: netflix.com/watch URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.netflix.com/watch/80100172')).toEqual({
      platform: 'netflix',
      type: 'title',
      id: '80100172'
    });
  });

  it('parseUrl: netflix.com/title URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.netflix.com/title/80100172')).toEqual({
      platform: 'netflix',
      type: 'title',
      id: '80100172'
    });
  });

  it('parseUrl: non-Netflix URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'netflix', type: 'title', id: '80100172' })).toEqual([
      'netflix:title:80100172',
      'https://www.netflix.com/title/80100172'
    ]);
  });

  it('contentKind: returns "netflix:title"', () => {
    expect(provider.contentKind()).toBe('netflix:title');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'netflix', type: 'title', id: '80100172' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind();
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PrimeVideoProvider
// ---------------------------------------------------------------------------
describe('PrimeVideoProvider', () => {
  const provider = new PrimeVideoProvider();

  it('parseUrl: primevideo.com URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.primevideo.com/detail/B0ABCDE1234')).toEqual({
      platform: 'primevideo',
      type: 'video',
      id: 'B0ABCDE1234'
    });
  });

  it('parseUrl: amazon.com gp/video URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.amazon.com/gp/video/detail/B0ABCDE1234')).toEqual({
      platform: 'primevideo',
      type: 'video',
      id: 'B0ABCDE1234'
    });
  });

  it('parseUrl: non-Prime Video URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(
      provider.toNostrTag({ platform: 'primevideo', type: 'video', id: 'B0ABCDE1234' })
    ).toEqual(['primevideo:video:B0ABCDE1234', 'https://www.primevideo.com/detail/B0ABCDE1234']);
  });

  it('contentKind: returns "primevideo:video"', () => {
    expect(provider.contentKind({ platform: 'primevideo', type: 'video', id: 'B0ABCDE1234' })).toBe(
      'primevideo:video'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'primevideo', type: 'video', id: 'B0ABCDE1234' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DisneyPlusProvider
// ---------------------------------------------------------------------------
describe('DisneyPlusProvider', () => {
  const provider = new DisneyPlusProvider();

  it('parseUrl: disneyplus.com/video URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.disneyplus.com/video/abc-def-123')).toEqual({
      platform: 'disneyplus',
      type: 'video',
      id: 'abc-def-123'
    });
  });

  it('parseUrl: disneyplus.com/play URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.disneyplus.com/play/abc-def-123')).toEqual({
      platform: 'disneyplus',
      type: 'video',
      id: 'abc-def-123'
    });
  });

  it('parseUrl: non-Disney+ URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(
      provider.toNostrTag({ platform: 'disneyplus', type: 'video', id: 'abc-def-123' })
    ).toEqual(['disneyplus:video:abc-def-123', 'https://www.disneyplus.com/video/abc-def-123']);
  });

  it('contentKind: returns "disneyplus:video"', () => {
    expect(provider.contentKind()).toBe('disneyplus:video');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'disneyplus', type: 'video', id: 'abc-def-123' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind();
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AppleMusicProvider
// ---------------------------------------------------------------------------
describe('AppleMusicProvider', () => {
  const provider = new AppleMusicProvider();

  it('parseUrl: album URL returns album ContentId', () => {
    expect(provider.parseUrl('https://music.apple.com/us/album/album-name/1234567890')).toEqual({
      platform: 'apple-music',
      type: 'album',
      id: '1234567890'
    });
  });

  it('parseUrl: album URL with ?i= returns song ContentId', () => {
    expect(
      provider.parseUrl('https://music.apple.com/us/album/album-name/1234567890?i=9876543210')
    ).toEqual({
      platform: 'apple-music',
      type: 'song',
      id: '9876543210'
    });
  });

  it('parseUrl: non-Apple Music URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag for album', () => {
    expect(
      provider.toNostrTag({ platform: 'apple-music', type: 'album', id: '1234567890' })
    ).toEqual(['apple-music:album:1234567890', 'https://music.apple.com/us/album/1234567890']);
  });

  it('contentKind: returns "apple-music:album" for album', () => {
    expect(provider.contentKind({ platform: 'apple-music', type: 'album', id: '1234567890' })).toBe(
      'apple-music:album'
    );
  });

  it('contentKind: returns "apple-music:song" for song', () => {
    expect(provider.contentKind({ platform: 'apple-music', type: 'song', id: '9876543210' })).toBe(
      'apple-music:song'
    );
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'apple-music', type: 'album', id: '1234567890' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FountainFmProvider
// ---------------------------------------------------------------------------
describe('FountainFmProvider', () => {
  const provider = new FountainFmProvider();

  it('parseUrl: fountain.fm episode URL returns ContentId', () => {
    expect(provider.parseUrl('https://fountain.fm/episode/abc123')).toEqual({
      platform: 'fountain',
      type: 'episode',
      id: 'abc123'
    });
  });

  it('parseUrl: www.fountain.fm URL returns ContentId', () => {
    expect(provider.parseUrl('https://www.fountain.fm/episode/xyz789')).toEqual({
      platform: 'fountain',
      type: 'episode',
      id: 'xyz789'
    });
  });

  it('parseUrl: non-Fountain URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'fountain', type: 'episode', id: 'abc123' })).toEqual([
      'fountain:episode:abc123',
      'https://fountain.fm/episode/abc123'
    ]);
  });

  it('contentKind: returns "fountain:episode"', () => {
    expect(provider.contentKind()).toBe('fountain:episode');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'fountain', type: 'episode', id: 'abc123' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind();
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AbemaProvider
// ---------------------------------------------------------------------------
describe('AbemaProvider', () => {
  const provider = new AbemaProvider();

  it('parseUrl: abema.tv episode URL returns ContentId', () => {
    expect(provider.parseUrl('https://abema.tv/video/episode/some-episode-slug')).toEqual({
      platform: 'abema',
      type: 'episode',
      id: 'some-episode-slug'
    });
  });

  it('parseUrl: abema.tv title URL returns ContentId', () => {
    expect(provider.parseUrl('https://abema.tv/video/title/some-title-slug')).toEqual({
      platform: 'abema',
      type: 'title',
      id: 'some-title-slug'
    });
  });

  it('parseUrl: non-AbemaTV URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag for episode', () => {
    expect(
      provider.toNostrTag({ platform: 'abema', type: 'episode', id: 'some-episode-slug' })
    ).toEqual([
      'abema:episode:some-episode-slug',
      'https://abema.tv/video/episode/some-episode-slug'
    ]);
  });

  it('contentKind: returns "abema:episode" for episode', () => {
    expect(
      provider.contentKind({ platform: 'abema', type: 'episode', id: 'some-episode-slug' })
    ).toBe('abema:episode');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'abema', type: 'episode', id: 'some-episode-slug' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TVerProvider
// ---------------------------------------------------------------------------
describe('TVerProvider', () => {
  const provider = new TVerProvider();

  it('parseUrl: tver.jp episodes URL returns ContentId', () => {
    expect(provider.parseUrl('https://tver.jp/episodes/ep12345678')).toEqual({
      platform: 'tver',
      type: 'episode',
      id: 'ep12345678'
    });
  });

  it('parseUrl: tver.jp lp/episodes URL returns ContentId', () => {
    expect(provider.parseUrl('https://tver.jp/lp/episodes/ep12345678')).toEqual({
      platform: 'tver',
      type: 'episode',
      id: 'ep12345678'
    });
  });

  it('parseUrl: non-TVer URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag', () => {
    expect(provider.toNostrTag({ platform: 'tver', type: 'episode', id: 'ep12345678' })).toEqual([
      'tver:episode:ep12345678',
      'https://tver.jp/episodes/ep12345678'
    ]);
  });

  it('contentKind: returns "tver:episode"', () => {
    const contentId = { platform: 'tver', type: 'episode', id: 'ep12345678' };
    expect(provider.contentKind(contentId)).toBe('tver:episode');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'tver', type: 'episode', id: 'ep12345678' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UNextProvider
// ---------------------------------------------------------------------------
describe('UNextProvider', () => {
  const provider = new UNextProvider();

  it('parseUrl: title-only URL returns title ContentId', () => {
    expect(provider.parseUrl('https://video.unext.jp/play/SID0012345')).toEqual({
      platform: 'unext',
      type: 'title',
      id: 'SID0012345'
    });
  });

  it('parseUrl: title+episode URL returns episode ContentId', () => {
    expect(provider.parseUrl('https://video.unext.jp/play/SID0012345/ED00067890')).toEqual({
      platform: 'unext',
      type: 'episode',
      id: 'SID0012345/ED00067890'
    });
  });

  it('parseUrl: non-U-NEXT URL returns null', () => {
    expect(provider.parseUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });

  it('parseUrl: empty string returns null', () => {
    expect(provider.parseUrl('')).toBeNull();
  });

  it('toNostrTag: returns correct NIP-73 tag for title', () => {
    expect(provider.toNostrTag({ platform: 'unext', type: 'title', id: 'SID0012345' })).toEqual([
      'unext:title:SID0012345',
      'https://video.unext.jp/play/SID0012345'
    ]);
  });

  it('toNostrTag: returns correct NIP-73 tag for episode', () => {
    expect(
      provider.toNostrTag({ platform: 'unext', type: 'episode', id: 'SID0012345/ED00067890' })
    ).toEqual([
      'unext:episode:SID0012345/ED00067890',
      'https://video.unext.jp/play/SID0012345/ED00067890'
    ]);
  });

  it('contentKind: returns "unext:title" for title', () => {
    expect(provider.contentKind({ platform: 'unext', type: 'title', id: 'SID0012345' })).toBe(
      'unext:title'
    );
  });

  it('contentKind: returns "unext:episode" for episode', () => {
    expect(
      provider.contentKind({ platform: 'unext', type: 'episode', id: 'SID0012345/ED00067890' })
    ).toBe('unext:episode');
  });

  it('toNostrTag()[0] prefix matches contentKind()', () => {
    const contentId = { platform: 'unext', type: 'title', id: 'SID0012345' };
    const [tagValue] = provider.toNostrTag(contentId);
    const kind = provider.contentKind(contentId);
    expect(tagValue.startsWith(`${kind}:`)).toBe(true);
  });
});
