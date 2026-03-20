/**
 * Test fixtures for E2E API integration tests.
 * Minimal data that satisfies the parsers while including UI-visible fields.
 */

/** @internal Use rssFeedXml(mockServerUrl) instead of this template directly */
const RSS_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Test Podcast</title>
    <podcast:guid>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</podcast:guid>
    <itunes:image href="https://example.com/cover.jpg"/>
    <item>
      <title>Episode 1: Hello World</title>
      <guid>ep-guid-001</guid>
      <enclosure url="MOCK_SERVER_URL/audio/ep1.mp3" type="audio/mpeg" length="1024000"/>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>12:34</itunes:duration>
      <description><![CDATA[This is the first episode description.]]></description>
    </item>
    <item>
      <title>Episode 2: Testing</title>
      <guid>ep-guid-002</guid>
      <enclosure url="MOCK_SERVER_URL/audio/ep2.mp3" type="audio/mpeg" length="2048000"/>
      <pubDate>Mon, 08 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>1:05:30</itunes:duration>
      <description>Second episode about testing.</description>
    </item>
  </channel>
</rss>`;

export function rssFeedXml(mockServerUrl: string): string {
  return RSS_FEED_XML.replace(/MOCK_SERVER_URL/g, mockServerUrl);
}

export function htmlWithRss(mockServerUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Site With RSS</title>
  <link rel="alternate" type="application/rss+xml" title="Feed" href="${mockServerUrl}/feed.xml"/>
</head>
<body><p>A page with an RSS feed link.</p></body>
</html>`;
}

export const HTML_NO_RSS = `<!DOCTYPE html>
<html>
<head><title>No RSS Here</title></head>
<body><p>Just a regular page.</p></body>
</html>`;

/**
 * Minimal ID3v2.3 header with TIT2 (title) and TPE1 (artist) frames.
 * ISO-8859-1 encoding (0x00 prefix byte).
 */
export function buildId3v2Binary(): Buffer {
  const title = 'Test Track Title';
  const artist = 'Test Artist';

  const tit2Payload = Buffer.from([0x00, ...Buffer.from(title, 'latin1')]);
  const tpe1Payload = Buffer.from([0x00, ...Buffer.from(artist, 'latin1')]);

  // Frame header: 4-byte ID + 4-byte size (big-endian) + 2-byte flags
  const tit2Frame = Buffer.alloc(10 + tit2Payload.length);
  tit2Frame.write('TIT2', 0);
  tit2Frame.writeUInt32BE(tit2Payload.length, 4);
  tit2Payload.copy(tit2Frame, 10);

  const tpe1Frame = Buffer.alloc(10 + tpe1Payload.length);
  tpe1Frame.write('TPE1', 0);
  tpe1Frame.writeUInt32BE(tpe1Payload.length, 4);
  tpe1Payload.copy(tpe1Frame, 10);

  const framesBuffer = Buffer.concat([tit2Frame, tpe1Frame]);

  // ID3v2 header: "ID3" + version(2.3) + flags + syncsafe size
  const totalSize = framesBuffer.length;
  const header = Buffer.alloc(10);
  header.write('ID3', 0);
  header[3] = 3; // version major
  header[4] = 0; // version minor
  header[5] = 0; // flags
  // Syncsafe integer encoding
  header[6] = (totalSize >> 21) & 0x7f;
  header[7] = (totalSize >> 14) & 0x7f;
  header[8] = (totalSize >> 7) & 0x7f;
  header[9] = totalSize & 0x7f;

  // Pad with enough zero bytes to simulate an audio file
  const padding = Buffer.alloc(256);
  return Buffer.concat([header, framesBuffer, padding]);
}
