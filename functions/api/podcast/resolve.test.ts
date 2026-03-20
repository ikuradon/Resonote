import { describe, it, expect } from 'vitest';
import {
  normalizeForDTag,
  domainRoot,
  extractTagContent,
  extractAttr,
  parseDurationToSeconds,
  detectInputType,
  findRssLink,
  parseRss
} from './resolve.js';

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

  it('should detect .rss as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed.rss'))).toBe('feed');
  });

  it('should detect .xml as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed.xml'))).toBe('feed');
  });

  it('should detect /feed/ path as feed', () => {
    expect(detectInputType(new URL('https://example.com/feed/podcast'))).toBe('feed');
  });

  it('should detect /rss path as feed', () => {
    expect(detectInputType(new URL('https://example.com/rss'))).toBe('feed');
  });

  it('should detect regular URL as site', () => {
    expect(detectInputType(new URL('https://example.com/podcast/episode-1'))).toBe('site');
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
    expect(result!.episodes[0].description).toBe('<p>HTML description</p>');
  });

  it('should extract itunes:image href', async () => {
    const xml = `<rss><channel><title>Podcast</title><podcast:guid>g</podcast:guid>
      <itunes:image href="https://example.com/cover.jpg"/>
      <item><title>Ep</title><guid>e1</guid><enclosure url="https://example.com/ep.mp3"/></item>
    </channel></rss>`;
    const result = await parseRss(xml, 'https://example.com/feed.xml');
    expect(result!.imageUrl).toBe('https://example.com/cover.jpg');
  });
});
