import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectInputType,
  domainRoot,
  extractAttr,
  extractTagContent,
  findRssLink,
  normalizeForDTag,
  parseDurationToSeconds,
  parseRss,
  podcastRoute
} from './podcast.js';

interface Bindings {
  SYSTEM_NOSTR_PRIVKEY?: string;
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
}

function createApp(): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route('/podcast', podcastRoute);
  return app;
}

function requestResolve(
  app: Hono<{ Bindings: Bindings }>,
  params: Record<string, string>,
  env: Partial<Bindings> = {}
): Response | Promise<Response> {
  const url = new URL('http://localhost/podcast/resolve');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return app.request(url.toString(), undefined, env);
}

async function parseJson(response: Response) {
  return JSON.parse(await response.text());
}

const TEST_PRIVKEY = 'a'.repeat(64);

describe('normalizeForDTag', () => {
  it('should normalize basic URL', () => {
    expect(normalizeForDTag('https://example.com/feed.xml')).toBe('example.com/feed.xml');
  });

  it('should remove trailing slash', () => {
    expect(normalizeForDTag('https://example.com/path/')).toBe('example.com/path');
  });

  it('should keep root slash', () => {
    expect(normalizeForDTag('https://example.com/')).toBe('example.com/');
  });

  it('should lowercase hostname', () => {
    expect(normalizeForDTag('https://EXAMPLE.COM/Feed.xml')).toBe('example.com/Feed.xml');
  });

  it('should include port if present', () => {
    expect(normalizeForDTag('https://example.com:8080/feed')).toBe('example.com:8080/feed');
  });

  it('should strip query and fragment', () => {
    expect(normalizeForDTag('https://example.com/feed?a=1#top')).toBe('example.com/feed');
  });
});

describe('domainRoot', () => {
  it('should extract domain root', () => {
    expect(domainRoot('https://example.com/path/to/feed')).toBe('https://example.com');
  });

  it('should lowercase', () => {
    expect(domainRoot('https://EXAMPLE.COM/path')).toBe('https://example.com');
  });

  it('should preserve protocol', () => {
    expect(domainRoot('http://example.com/feed.xml')).toBe('http://example.com');
  });

  it('should preserve non-standard port', () => {
    expect(domainRoot('http://127.0.0.1:3000/audio.mp3')).toBe('http://127.0.0.1:3000');
  });

  it('should omit standard ports', () => {
    expect(domainRoot('https://example.com:443/feed')).toBe('https://example.com');
    expect(domainRoot('http://example.com:80/feed')).toBe('http://example.com');
  });
});

describe('extractTagContent', () => {
  it('should extract plain text content', () => {
    expect(extractTagContent('<title>My Podcast</title>', 'title')).toBe('My Podcast');
  });

  it('should extract CDATA content', () => {
    expect(extractTagContent('<title><![CDATA[My <Podcast>]]></title>', 'title')).toBe(
      'My <Podcast>'
    );
  });

  it('should return empty string if tag not found', () => {
    expect(extractTagContent('<description>text</description>', 'title')).toBe('');
  });

  it('should handle tag with attributes', () => {
    expect(extractTagContent('<title type="text">My Title</title>', 'title')).toBe('My Title');
  });

  it('should trim whitespace', () => {
    expect(extractTagContent('<title>  My Title  </title>', 'title')).toBe('My Title');
  });

  it('should handle multiline content', () => {
    expect(extractTagContent('<description>Line 1\nLine 2</description>', 'description')).toBe(
      'Line 1\nLine 2'
    );
  });

  it('should extract CDATA with whitespace before closing tag', () => {
    expect(
      extractTagContent('<description><![CDATA[content]]>\n</description>', 'description')
    ).toBe('content');
  });

  it('should extract CDATA with whitespace after opening tag', () => {
    expect(
      extractTagContent('<description>\n<![CDATA[content]]></description>', 'description')
    ).toBe('content');
  });

  it('should handle namespaced tags', () => {
    expect(
      extractTagContent('<itunes:summary>Summary here</itunes:summary>', 'itunes:summary')
    ).toBe('Summary here');
  });
});

describe('extractAttr', () => {
  it('should extract attribute value', () => {
    expect(extractAttr('<enclosure url="https://example.com/ep.mp3" />', 'enclosure', 'url')).toBe(
      'https://example.com/ep.mp3'
    );
  });

  it('should handle single quotes', () => {
    expect(extractAttr("<enclosure url='https://example.com/ep.mp3' />", 'enclosure', 'url')).toBe(
      'https://example.com/ep.mp3'
    );
  });

  it('should return empty string if not found', () => {
    expect(extractAttr('<enclosure />', 'enclosure', 'url')).toBe('');
  });

  it('should extract itunes:image href', () => {
    expect(
      extractAttr('<itunes:image href="https://example.com/img.jpg" />', 'itunes:image', 'href')
    ).toBe('https://example.com/img.jpg');
  });
});

describe('parseDurationToSeconds', () => {
  it('should parse HH:MM:SS', () => {
    expect(parseDurationToSeconds('1:30:45')).toBe(5445);
  });

  it('should parse MM:SS', () => {
    expect(parseDurationToSeconds('45:30')).toBe(2730);
  });

  it('should parse raw seconds', () => {
    expect(parseDurationToSeconds('3600')).toBe(3600);
  });

  it('should return 0 for empty string', () => {
    expect(parseDurationToSeconds('')).toBe(0);
  });

  it('should return 0 for NaN input', () => {
    expect(parseDurationToSeconds('abc')).toBe(0);
  });

  it('should handle 0:00', () => {
    expect(parseDurationToSeconds('0:00')).toBe(0);
  });

  it('should handle single digit minutes', () => {
    expect(parseDurationToSeconds('5:30')).toBe(330);
  });
});

describe('detectInputType', () => {
  it('should detect .mp3 as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.mp3'))).toBe('audio');
  });

  it('should detect .m4a as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.m4a'))).toBe('audio');
  });

  it('should detect .ogg as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.ogg'))).toBe('audio');
  });

  it('should detect .wav as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.wav'))).toBe('audio');
  });

  it('should detect .opus as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.opus'))).toBe('audio');
  });

  it('should detect .flac as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.flac'))).toBe('audio');
  });

  it('should detect .aac as audio', () => {
    expect(detectInputType(new URL('https://example.com/ep.aac'))).toBe('audio');
  });

  it('should detect .rss as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed.rss'))).toBe('feed');
  });

  it('should detect .xml as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed.xml'))).toBe('feed');
  });

  it('should detect .atom as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed.atom'))).toBe('feed');
  });

  it('should detect .json as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed.json'))).toBe('feed');
  });

  it('should detect /feed/ path as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed/podcast'))).toBe('feed');
  });

  it('should detect /rss path as feed', () => {
    expect(detectInputType(new URL('https://example.com/rss'))).toBe('feed');
  });

  it('should detect /atom path as feed', () => {
    expect(detectInputType(new URL('https://example.com/atom'))).toBe('feed');
  });

  it('should detect regular URL as site', () => {
    expect(detectInputType(new URL('https://example.com/podcast/episode-1'))).toBe('site');
  });

  it('should detect Apple Podcasts URL as apple-podcasts', () => {
    expect(
      detectInputType(new URL('https://podcasts.apple.com/us/podcast/my-podcast/id1234567890'))
    ).toBe('apple-podcasts');
  });

  it('should detect Apple Podcasts URL without country as apple-podcasts', () => {
    expect(
      detectInputType(new URL('https://podcasts.apple.com/podcast/my-podcast/id1234567890'))
    ).toBe('apple-podcasts');
  });

  it('should detect Apple Podcasts URL without slug as apple-podcasts', () => {
    expect(detectInputType(new URL('https://podcasts.apple.com/us/podcast/id1234567890'))).toBe(
      'apple-podcasts'
    );
  });
});

describe('findRssLink', () => {
  it('should find RSS link in HTML', () => {
    const html = '<html><head><link type="application/rss+xml" href="/feed.xml"></head></html>';
    expect(findRssLink(html, 'https://example.com')).toBe('https://example.com/feed.xml');
  });

  it('should resolve relative URLs', () => {
    const html = '<link type="application/rss+xml" href="feed.xml">';
    expect(findRssLink(html, 'https://example.com/blog/')).toBe(
      'https://example.com/blog/feed.xml'
    );
  });

  it('should handle absolute URLs', () => {
    const html = '<link type="application/rss+xml" href="https://feeds.example.com/rss">';
    expect(findRssLink(html, 'https://example.com')).toBe('https://feeds.example.com/rss');
  });

  it('should return null if no RSS link', () => {
    const html = '<html><head><link type="text/css" href="style.css"></head></html>';
    expect(findRssLink(html, 'https://example.com')).toBeNull();
  });
});

describe('parseRss', () => {
  const MINIMAL_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Podcast</title>
    <podcast:guid>test-guid-123</podcast:guid>
    <item>
      <title>Episode 1</title>
      <guid>ep-1</guid>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" />
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>1:30:00</itunes:duration>
      <description>Episode 1 description</description>
    </item>
  </channel>
</rss>`;

  it('should parse minimal RSS feed', async () => {
    const result = await parseRss(MINIMAL_RSS, 'https://example.com/feed.xml');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Podcast');
    expect(result!.podcastGuid).toBe('test-guid-123');
    expect(result!.episodes).toHaveLength(1);
    expect(result!.episodes[0].title).toBe('Episode 1');
    expect(result!.episodes[0].guid).toBe('ep-1');
    expect(result!.episodes[0].enclosureUrl).toBe('https://example.com/ep1.mp3');
    expect(result!.episodes[0].duration).toBe(5400);
    expect(result!.episodes[0].description).toBe('Episode 1 description');
  });

  it('should return null for non-RSS XML', async () => {
    const result = await parseRss(
      '<html><body>Not RSS</body></html>',
      'https://example.com/feed.xml'
    );
    expect(result).toBeNull();
  });

  it('should return null for channel without title', async () => {
    const xml = '<rss><channel><item><enclosure url="x.mp3"/></item></channel></rss>';
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result).toBeNull();
  });

  it('should skip items without enclosure', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <item><title>No Audio</title></item>
      <item><title>Has Audio</title><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.episodes).toHaveLength(1);
    expect(result!.episodes[0].title).toBe('Has Audio');
  });

  it('should limit to 100 episodes', async () => {
    const items = Array.from(
      { length: 101 },
      (_, i) =>
        `<item><title>Ep ${i}</title><guid>g${i}</guid><enclosure url="https://example.com/${i}.mp3"/></item>`
    ).join('');
    const xml = `<rss><channel><title>Big Podcast</title><podcast:guid>g</podcast:guid>${items}</channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.episodes).toHaveLength(100);
  });

  it('should generate synthetic guid when podcast:guid is missing', async () => {
    const xml = `<rss><channel><title>No GUID Podcast</title>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.podcastGuid).toBeTruthy();
    expect(result!.podcastGuid).not.toBe('');
  });

  it('should handle CDATA in description', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/>
        <description><![CDATA[<p>HTML description</p>]]></description>
      </item></channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.episodes[0].description).toBe('HTML description');
  });

  it('should extract itunes:image href', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <itunes:image href="https://example.com/cover.jpg"/>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.imageUrl).toBe('https://example.com/cover.jpg');
  });

  it('should fall back to itunes:summary when description is empty', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/>
        <itunes:summary>Summary text</itunes:summary>
      </item></channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.episodes[0].description).toBe('Summary text');
  });

  it('should extract feed description from channel', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <description>Feed description text</description>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.description).toBe('Feed description text');
  });

  it('should fall back to itunes:summary for feed description', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <itunes:summary>Feed summary</itunes:summary>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.description).toBe('Feed summary');
  });

  it('should return empty string for feed description when none present', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.description).toBe('');
  });

  it('should convert HTML in feed description to markdown', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <description><![CDATA[<p>A <b>bold</b> podcast</p>]]></description>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.description).toBe('A **bold** podcast');
  });

  it('should convert HTML in episode description to markdown', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/>
        <description><![CDATA[<p>Visit <a href="https://example.com">us</a></p>]]></description>
      </item></channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.episodes[0].description).toBe('Visit [us](https://example.com)');
  });

  it('should strip HTML from episode titles', async () => {
    const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>My Podcast</title>
  <item>
    <title><![CDATA[<b>Episode</b> <script>alert(1)</script>One]]></title>
    <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/>
    <guid>guid1</guid>
  </item>
</channel></rss>`;
    const result = await parseRss(rss, 'https://example.com/feed.xml');
    expect(result!.episodes[0].title).toBe('Episode alert(1)One');
  });

  it('should reject non-http imageUrl', async () => {
    const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>My Podcast</title>
  <itunes:image href="javascript:alert(1)"/>
  <item>
    <title>Ep1</title>
    <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg"/>
    <guid>guid1</guid>
  </item>
</channel></rss>`;
    const result = await parseRss(rss, 'https://example.com/feed.xml');
    expect(result!.imageUrl).toBe('');
  });

  it('should reject non-http enclosureUrl', async () => {
    const rss = `<?xml version="1.0"?>
<rss><channel>
  <title>My Podcast</title>
  <item>
    <title>Ep1</title>
    <enclosure url="javascript:alert(1)" type="audio/mpeg"/>
    <guid>guid1</guid>
  </item>
</channel></rss>`;
    const result = await parseRss(rss, 'https://example.com/feed.xml');
    expect(result!.episodes.length).toBe(0);
  });
});

const mockCache = { match: vi.fn(), put: vi.fn() };

describe('handleRequest (podcastRoute)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCache.match.mockReset().mockResolvedValue(undefined);
    mockCache.put.mockReset();
    vi.stubGlobal('caches', { default: mockCache });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('parameter validation', () => {
    it('returns 400 when url parameter is missing', async () => {
      const app = createApp();
      const res = await requestResolve(app, {}, { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY });
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error).toBe('missing_url');
    });

    it('returns 400 for invalid URL', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'not-a-url' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error).toBe('missing_url');
    });

    it('returns 400 for javascript: scheme', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'javascript:alert(1)' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for data: scheme', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'data:text/html,<h1>hi</h1>' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for ftp: scheme', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'ftp://example.com/file.mp3' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for SSRF blocked URL (localhost)', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'http://localhost/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error).toBe('url_blocked');
    });

    it('returns 400 for SSRF blocked URL (127.0.0.1)', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'http://127.0.0.1/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error).toBe('url_blocked');
    });

    it('returns 400 for SSRF blocked URL (private IP 10.x)', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'http://10.0.0.1/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error).toBe('url_blocked');
    });
  });

  describe('server configuration', () => {
    it('returns 500 when SYSTEM_NOSTR_PRIVKEY is not set', async () => {
      const app = createApp();
      const res = await requestResolve(app, { url: 'https://example.com/feed.xml' }, {});
      expect(res.status).toBe(500);
      const body = await parseJson(res);
      expect(body.error).toBe('server_misconfigured');
    });

    it('returns 500 for invalid privkey hex', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: 'not-valid-hex!' }
      );
      expect(res.status).toBe(500);
      const body = await parseJson(res);
      expect(body.error).toBe('server_misconfigured');
    });

    it('returns 500 for empty privkey', async () => {
      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: '' }
      );
      expect(res.status).toBe(500);
      const body = await parseJson(res);
      expect(body.error).toBe('server_misconfigured');
    });
  });

  describe('handleFeedUrl', () => {
    it('returns feed data with signed events for valid RSS', async () => {
      const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Podcast</title>
    <podcast:guid>test-guid-123</podcast:guid>
    <item>
      <title>Episode 1</title>
      <guid>ep-1</guid>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" />
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>1:30:00</itunes:duration>
      <description>Episode 1 description</description>
    </item>
  </channel>
</rss>`;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rssXml, { status: 200 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);

      const body = await parseJson(res);
      expect(body.type).toBe('feed');
      expect(body.feed.title).toBe('Test Podcast');
      expect(body.feed.podcastGuid).toBe('test-guid-123');
      expect(body.episodes).toHaveLength(1);
      expect(body.episodes[0].title).toBe('Episode 1');

      expect(body.signedEvents).toHaveLength(2);
      for (const evt of body.signedEvents) {
        expect(evt.kind).toBe(39701);
        expect(evt.id).toBeDefined();
        expect(evt.sig).toBeDefined();
      }
    });

    it('returns 502 when feed fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(502);
      const body = await parseJson(res);
      expect(body.error).toBe('fetch_failed');
    });

    it('returns 422 when RSS parsing fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html>Not RSS</html>', { status: 200 }))
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(422);
      const body = await parseJson(res);
      expect(body.error).toBe('parse_failed');
    });

    it('returns 500 when fetch throws (internal_error)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(500);
      const body = await parseJson(res);
      expect(body.error).toBe('internal_error');
    });
  });

  describe('handleAudioUrl', () => {
    it('returns episode with metadata from RSS auto-discovery', async () => {
      const rssXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Podcast</title>
    <podcast:guid>pguid</podcast:guid>
    <itunes:image href="https://example.com/cover.jpg"/>
    <item>
      <title>Matched Ep</title>
      <guid>ep-matched</guid>
      <enclosure url="https://example.com/audio/ep.mp3" type="audio/mpeg" />
      <description>Ep desc</description>
    </item>
  </channel>
</rss>`;

      const siteHtml =
        '<html><head><link type="application/rss+xml" href="/feed.xml"></head></html>';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (url.includes('feed.xml')) {
            return Promise.resolve(new Response(rssXml, { status: 200 }));
          }
          return Promise.resolve(new Response(siteHtml, { status: 200 }));
        })
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/audio/ep.mp3' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);

      const body = await parseJson(res);
      expect(body.type).toBe('episode');
      expect(body.episode.title).toBe('Matched Ep');
      expect(body.feed.title).toBe('Podcast');
      expect(body.signedEvents).toHaveLength(2);
      expect(body.metadata.title).toBe('Matched Ep');
      expect(body.metadata.artist).toBe('Podcast');
    });

    it('returns audio metadata fallback when no RSS match', async () => {
      const siteHtml = '<html><body>No RSS here</body></html>';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          // fetchAudioMetadata sends Range header — return empty audio data
          const headers = init?.headers as Record<string, string> | undefined;
          if (headers?.Range) {
            return Promise.resolve(new Response(new ArrayBuffer(0), { status: 206 }));
          }
          return Promise.resolve(new Response(siteHtml, { status: 200 }));
        })
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/audio/ep.mp3' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);

      const body = await parseJson(res);
      expect(body.type).toBe('episode');
      expect(body.feed).toBeNull();
      expect(body.signedEvents).toEqual([]);
    });

    it('handles root discovery failure gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          // fetchAudioMetadata sends Range header — return empty audio data
          const headers = init?.headers as Record<string, string> | undefined;
          if (headers?.Range) {
            return Promise.resolve(new Response(new ArrayBuffer(0), { status: 206 }));
          }
          return Promise.resolve(new Response('Server Error', { status: 500 }));
        })
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/audio/ep.mp3' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);

      const body = await parseJson(res);
      expect(body.type).toBe('episode');
      expect(body.feed).toBeNull();
    });
  });

  describe('handleSiteUrl', () => {
    it('returns redirect when RSS link is found', async () => {
      const siteHtml =
        '<html><head><link type="application/rss+xml" href="/feed.xml"></head></html>';

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(siteHtml, { status: 200 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/podcast-page' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);

      const body = await parseJson(res);
      expect(body.type).toBe('redirect');
      expect(body.feedUrl).toBe('https://example.com/feed.xml');
    });

    it('falls back to domain root when page has no RSS link', async () => {
      const pageHtml = '<html><body>No RSS</body></html>';
      const rootHtml =
        '<html><head><link type="application/rss+xml" href="/feed.xml"></head></html>';

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string | URL) => {
          const urlStr = url.toString();
          if (urlStr === 'https://example.com/blog/post') {
            return Promise.resolve(new Response(pageHtml, { status: 200 }));
          }
          return Promise.resolve(new Response(rootHtml, { status: 200 }));
        })
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/blog/post' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);

      const body = await parseJson(res);
      expect(body.type).toBe('redirect');
      expect(body.feedUrl).toBe('https://example.com/feed.xml');
    });

    it('returns 404 when no RSS link found anywhere', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html><body>No RSS</body></html>', { status: 200 }))
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/blog/post' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error).toBe('rss_not_found');
    });

    it('returns 502 when site fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Error', { status: 503 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/podcast-page' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(502);
      const body = await parseJson(res);
      expect(body.error).toBe('fetch_failed');
    });
  });

  describe('handleApplePodcasts', () => {
    it('routes Apple Podcasts URL through iTunes Lookup and feed handler', async () => {
      const rssXml = `<rss><channel><title>Apple Pod</title><podcast:guid>ag</podcast:guid>
        <item><title>Ep1</title><guid>ae1</guid><enclosure url="https://example.com/ae.mp3"/></item>
      </channel></rss>`;

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('itunes.apple.com/lookup')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                resultCount: 1,
                results: [{ feedUrl: 'https://example.com/apple-feed.xml' }]
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response(rssXml, { status: 200 }));
      });
      vi.stubGlobal('fetch', mockFetch);

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://podcasts.apple.com/us/podcast/my-podcast/id1234567890' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.type).toBe('feed');
      expect(body.feed.title).toBe('Apple Pod');
    });

    it('returns 404 when iTunes lookup has no feedUrl', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ resultCount: 0, results: [{}] }), { status: 200 })
          )
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://podcasts.apple.com/us/podcast/my-podcast/id1234567890' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(404);
      const body = await parseJson(res);
      expect(body.error).toBe('feed_not_found');
    });

    it('returns 502 when iTunes lookup request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Error', { status: 500 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://podcasts.apple.com/us/podcast/my-podcast/id1234567890' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(502);
      const body = await parseJson(res);
      expect(body.error).toBe('apple_lookup_failed');
    });

    it('returns 502 when iTunes lookup throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://podcasts.apple.com/us/podcast/my-podcast/id1234567890' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(502);
      const body = await parseJson(res);
      expect(body.error).toBe('apple_lookup_failed');
    });
  });

  describe('handleFeedUrl feed description in response', () => {
    it('includes feed description in response body', async () => {
      const rssXml = `<rss><channel><title>Pod</title><podcast:guid>g</podcast:guid>
        <description>My podcast description</description>
        <item><title>E</title><guid>e</guid><enclosure url="https://example.com/e.mp3"/></item>
      </channel></rss>`;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rssXml, { status: 200 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      const body = await parseJson(res);
      expect(body.feed.description).toBe('My podcast description');
    });

    it('includes feed description in signed feed event content', async () => {
      const rssXml = `<rss><channel><title>Pod</title><podcast:guid>g</podcast:guid>
        <description>My podcast description</description>
        <item><title>E</title><guid>e</guid><enclosure url="https://example.com/e.mp3"/>
          <description>Episode desc</description>
        </item>
      </channel></rss>`;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rssXml, { status: 200 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      const body = await parseJson(res);

      // First signed event is the feed bookmark
      const feedEvent = body.signedEvents[0];
      expect(feedEvent.content).toBe('My podcast description');

      // Second signed event is the episode bookmark
      const episodeEvent = body.signedEvents[1];
      expect(episodeEvent.content).toBe('Episode desc');
    });
  });

  describe('input type routing', () => {
    it('routes .mp3 to audio handler', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(new ArrayBuffer(0), { status: 200 }))
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/ep.mp3' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.type).toBe('episode');
    });

    it('routes .xml to feed handler', async () => {
      const rssXml = `<rss><channel><title>Pod</title><podcast:guid>g</podcast:guid>
        <item><title>E</title><guid>e</guid><enclosure url="https://example.com/e.mp3"/></item>
      </channel></rss>`;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rssXml, { status: 200 })));

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/feed.xml' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.type).toBe('feed');
    });

    it('routes plain URL to site handler', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('<html><body>No RSS</body></html>', { status: 200 }))
      );

      const app = createApp();
      const res = await requestResolve(
        app,
        { url: 'https://example.com/podcast-page' },
        { SYSTEM_NOSTR_PRIVKEY: TEST_PRIVKEY }
      );
      expect(res.status).toBe(404);
    });
  });
});
