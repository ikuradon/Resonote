import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAudioMetadata } from './audio-metadata.js';

// --- Helpers to build binary test data ---

function strToBytes(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function writeUint32LE(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

function writeUint32BE(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function syncsafeEncode(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function buildId3v2Frame(id: string, payload: number[]): number[] {
  const idBytes = strToBytes(id);
  // ID3v2.3 uses big-endian non-syncsafe size for frames
  const size = writeUint32BE(payload.length);
  const flags = [0x00, 0x00];
  return [...idBytes, ...size, ...flags, ...payload];
}

function buildId3v2v4Frame(id: string, payload: number[]): number[] {
  const idBytes = strToBytes(id);
  // ID3v2.4 uses syncsafe size for frames
  const size = syncsafeEncode(payload.length);
  const flags = [0x00, 0x00];
  return [...idBytes, ...size, ...flags, ...payload];
}

function buildId3v2Tag(frames: number[], version = 0x03, flags = 0x00): Uint8Array {
  const header = [
    ...strToBytes('ID3'), // magic
    version,
    0x00, // revision 0
    flags,
    ...syncsafeEncode(frames.length)
  ];
  return new Uint8Array([...header, ...frames]);
}

function buildVorbisCommentBlock(comments: string[], vendor = 'test'): number[] {
  const vendorBytes = strToBytes(vendor);
  const out: number[] = [
    ...writeUint32LE(vendorBytes.length),
    ...vendorBytes,
    ...writeUint32LE(comments.length)
  ];
  for (const c of comments) {
    const cBytes = strToBytes(c);
    out.push(...writeUint32LE(cBytes.length), ...cBytes);
  }
  return out;
}

function buildOggPage(pageData: number[], pageSequence: number): number[] {
  const segments = pageData.length <= 255 ? [pageData.length] : [];
  if (pageData.length > 255) {
    let remaining = pageData.length;
    while (remaining > 255) {
      segments.push(255);
      remaining -= 255;
    }
    segments.push(remaining);
  }

  const header = [
    ...strToBytes('OggS'),
    0x00, // version
    0x00, // header type
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // granule pos
    0x01,
    0x00,
    0x00,
    0x00, // serial
    ...writeUint32LE(pageSequence), // page sequence
    0x00,
    0x00,
    0x00,
    0x00, // checksum (ignored by parser)
    segments.length, // number of segments
    ...segments,
    ...pageData
  ];
  return header;
}

function buildApicFrame(
  mime: string,
  imageData: number[],
  encoding = 0,
  description = ''
): number[] {
  const mimeBytes = strToBytes(mime);
  const payload: number[] = [encoding, ...mimeBytes, 0x00, 0x03]; // picture type = front cover

  if (encoding === 0 || encoding === 3) {
    // UTF-8 / ISO-8859-1: null-terminated description
    payload.push(...strToBytes(description), 0x00);
  } else {
    // UTF-16: double-null terminated description
    for (const ch of description) {
      const code = ch.charCodeAt(0);
      payload.push(code & 0xff, (code >> 8) & 0xff);
    }
    payload.push(0x00, 0x00);
  }

  payload.push(...imageData);
  return payload;
}

function buildFlacMetadataBlock(blockType: number, blockData: number[], isLast: boolean): number[] {
  const typeByte = isLast ? blockType | 0x80 : blockType;
  return [
    typeByte,
    (blockData.length >> 16) & 0xff,
    (blockData.length >> 8) & 0xff,
    blockData.length & 0xff,
    ...blockData
  ];
}

function buildFlacPictureData(mime: string, description: string, imageData: number[]): number[] {
  const mimeBytes = strToBytes(mime);
  const descBytes = strToBytes(description);
  return [
    ...writeUint32BE(3), // picture type: front cover
    ...writeUint32BE(mimeBytes.length),
    ...mimeBytes,
    ...writeUint32BE(descBytes.length),
    ...descBytes,
    ...writeUint32BE(100), // width
    ...writeUint32BE(100), // height
    ...writeUint32BE(24), // color depth
    ...writeUint32BE(0), // colors used
    ...writeUint32BE(imageData.length),
    ...imageData
  ];
}

function mockFetch(data: Uint8Array, status = 206) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () =>
      Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  });
}

describe('audio-metadata', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ID3v2 parsing', () => {
    it('should parse TIT2, TPE1, TALB frames', async () => {
      const titlePayload = [0x03, ...strToBytes('Test Title')]; // encoding=3 (UTF-8)
      const artistPayload = [0x03, ...strToBytes('Test Artist')];
      const albumPayload = [0x03, ...strToBytes('Test Album')];

      const frames = [
        ...buildId3v2Frame('TIT2', titlePayload),
        ...buildId3v2Frame('TPE1', artistPayload),
        ...buildId3v2Frame('TALB', albumPayload)
      ];

      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Test Title');
      expect(result.artist).toBe('Test Artist');
      expect(result.album).toBe('Test Album');
    });

    it('should return empty object for data shorter than 10 bytes', async () => {
      const data = new Uint8Array([...strToBytes('ID3'), 0x03, 0x00, 0x00]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });

    it('should handle ISO-8859-1 encoding (encoding byte = 0)', async () => {
      const titlePayload = [0x00, ...strToBytes('Latin Title')];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Latin Title');
    });

    it('should handle UTF-16 LE with BOM (encoding byte = 1)', async () => {
      // BOM FF FE = little-endian, then "Hi" in UTF-16 LE
      const titlePayload = [
        0x01, // encoding = UTF-16
        0xff,
        0xfe, // BOM LE
        0x48,
        0x00, // 'H'
        0x69,
        0x00 // 'i'
      ];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Hi');
    });

    it('should handle UTF-16 BE with BOM (encoding byte = 1)', async () => {
      // BOM FE FF = big-endian, then "Hi" in UTF-16 BE
      const titlePayload = [
        0x01, // encoding = UTF-16
        0xfe,
        0xff, // BOM BE
        0x00,
        0x48, // 'H'
        0x00,
        0x69 // 'i'
      ];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Hi');
    });

    it('should handle UTF-16BE without BOM (encoding byte = 2)', async () => {
      const titlePayload = [
        0x02, // encoding = UTF-16BE (no BOM)
        0x00,
        0x41, // 'A'
        0x00,
        0x42 // 'B'
      ];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('AB');
    });

    it('should handle unknown encoding as UTF-8 fallback', async () => {
      const titlePayload = [0x05, ...strToBytes('Fallback')]; // encoding=5 (unknown)
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Fallback');
    });

    it('should return empty string for frame with only encoding byte', async () => {
      const titlePayload = [0x03]; // encoding byte only, no text
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('');
    });

    it('should handle extended header', async () => {
      const titlePayload = [0x03, ...strToBytes('Extended')];
      const frameBytes = buildId3v2Frame('TIT2', titlePayload);
      const extHeaderSize = 6;
      const extHeader = [...syncsafeEncode(extHeaderSize), 0x00, 0x00];

      const totalSize = extHeader.length + frameBytes.length;
      const header = [
        ...strToBytes('ID3'),
        0x03,
        0x00,
        0x40, // flags: extended header
        ...syncsafeEncode(totalSize)
      ];

      const data = new Uint8Array([...header, ...extHeader, ...frameBytes]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Extended');
    });

    it('should stop parsing at null frame ID', async () => {
      const titlePayload = [0x03, ...strToBytes('Only Title')];
      const frameBytes = buildId3v2Frame('TIT2', titlePayload);
      const padding = new Array(20).fill(0);

      const totalPayload = [...frameBytes, ...padding];
      const data = buildId3v2Tag(totalPayload);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Only Title');
      expect(result.artist).toBeUndefined();
    });

    it('should parse ID3v2.4 with syncsafe frame sizes', async () => {
      const titlePayload = [0x03, ...strToBytes('v2.4 Title')];
      const frames = buildId3v2v4Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames, 0x04);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('v2.4 Title');
    });

    it('should skip unrecognized frame IDs', async () => {
      const unknownPayload = [0x03, ...strToBytes('ignored')];
      const titlePayload = [0x03, ...strToBytes('Found')];
      const frames = [
        ...buildId3v2Frame('WXXX', unknownPayload),
        ...buildId3v2Frame('TIT2', titlePayload)
      ];
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Found');
    });
  });

  describe('APIC (cover art) parsing', () => {
    it('should parse APIC frame with ISO-8859-1 encoding', async () => {
      const fakeImage = new Array(20).fill(0xab);
      const apicPayload = buildApicFrame('image/jpeg', fakeImage, 0);
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should parse APIC frame with UTF-8 encoding', async () => {
      const fakeImage = new Array(15).fill(0xcd);
      const apicPayload = buildApicFrame('image/png', fakeImage, 3, 'cover');
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toMatch(/^data:image\/png;base64,/);
    });

    it('should parse APIC frame with UTF-16 encoding description', async () => {
      const fakeImage = new Array(15).fill(0xef);
      const apicPayload = buildApicFrame('image/jpeg', fakeImage, 1, '');
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should skip APIC image data > 100KB', async () => {
      const largeImage = new Array(100 * 1024 + 1).fill(0xff);
      const apicPayload = buildApicFrame('image/jpeg', largeImage, 0);
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toBeUndefined();
    });

    it('should skip APIC with image data < 10 bytes', async () => {
      const tinyImage = new Array(5).fill(0xff);
      const apicPayload = buildApicFrame('image/jpeg', tinyImage, 0);
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toBeUndefined();
    });

    it('should return undefined for APIC frame shorter than 4 bytes', async () => {
      const apicPayload = [0x00, 0x01]; // Too short
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toBeUndefined();
    });

    it('should use image/jpeg as default MIME when empty', async () => {
      // Manually build APIC with empty MIME
      const fakeImage = new Array(20).fill(0xab);
      const payload: number[] = [
        0x00, // encoding ISO-8859-1
        0x00, // empty MIME (null terminated immediately)
        0x03, // picture type
        0x00, // description (null terminated)
        ...fakeImage
      ];
      const frames = buildId3v2Frame('APIC', payload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should return undefined for APIC with no null terminator in MIME', async () => {
      // APIC frame where MIME never has a null terminator
      const payload = [0x00, ...strToBytes('image/jpeg')]; // no null terminator
      const frames = buildId3v2Frame('APIC', payload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toBeUndefined();
    });

    it('should pass through allowed MIME types (image/png, image/gif, image/webp)', async () => {
      for (const allowedMime of ['image/png', 'image/gif', 'image/webp']) {
        const fakeImage = new Array(20).fill(0xab);
        const apicPayload = buildApicFrame(allowedMime, fakeImage, 0);
        const frames = buildId3v2Frame('APIC', apicPayload);
        const data = buildId3v2Tag(frames);
        vi.stubGlobal('fetch', mockFetch(data));

        const result = await fetchAudioMetadata('https://example.com/test.mp3');
        expect(result.image).toMatch(new RegExp(`^data:${allowedMime.replace('/', '/')};base64,`));
      }
    });

    it('should fall back to image/jpeg for disallowed MIME types (image/svg+xml)', async () => {
      const fakeImage = new Array(20).fill(0xab);
      const apicPayload = buildApicFrame('image/svg+xml', fakeImage, 0);
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should fall back to image/jpeg for disallowed MIME types (text/html)', async () => {
      const fakeImage = new Array(20).fill(0xab);
      const apicPayload = buildApicFrame('text/html', fakeImage, 0);
      const frames = buildId3v2Frame('APIC', apicPayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe('Vorbis comment parsing (OGG)', () => {
    it('should parse Vorbis comments from OGG container', async () => {
      const comments = buildVorbisCommentBlock([
        'TITLE=Vorbis Title',
        'ARTIST=Vorbis Artist',
        'ALBUM=Vorbis Album'
      ]);
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...comments];

      // First page (identification header - minimal)
      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result.title).toBe('Vorbis Title');
      expect(result.artist).toBe('Vorbis Artist');
      expect(result.album).toBe('Vorbis Album');
    });

    it('should parse OpusTags from OGG container', async () => {
      const comments = buildVorbisCommentBlock(['TITLE=Opus Title', 'ARTIST=Opus Artist']);
      const opusTags = [...strToBytes('OpusTags'), ...comments];

      const idHeader = [...strToBytes('OpusHead'), ...new Array(11).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(opusTags, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.opus');
      expect(result.title).toBe('Opus Title');
      expect(result.artist).toBe('Opus Artist');
    });

    it('should return empty object for OGG without comment page', async () => {
      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      // No second page with comments

      const data = new Uint8Array(page0);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should return empty for OGG with invalid second page magic', async () => {
      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      // Corrupt bytes after first page (not a valid OggS header)
      const corrupt = [0x00, 0x00, 0x00, 0x00, ...new Array(30).fill(0x42)];

      const data = new Uint8Array([...page0, ...corrupt]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should return empty for OGG page with segment table exceeding data', async () => {
      // Build OGG header where segment count points beyond data boundary
      const header = [
        ...strToBytes('OggS'),
        0x00, // version
        0x00, // header type
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00, // granule pos
        0x01,
        0x00,
        0x00,
        0x00, // serial
        ...writeUint32LE(0), // page sequence
        0x00,
        0x00,
        0x00,
        0x00, // checksum
        0xff // segments = 255, but no segment table data follows
      ];
      const data = new Uint8Array(header);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should handle OGG with non-comment second page (no Vorbis/Opus marker)', async () => {
      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      // Second page with random data (not vorbis comment or OpusTags)
      const randomData = new Array(30).fill(0x42);
      const page1 = buildOggPage(randomData, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should stop OGG parsing after 4 pages', async () => {
      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const randomData = new Array(10).fill(0x42);

      // Build 5 pages: page0 (id) + 4 random pages (none with vorbis comment)
      const pages = [
        ...buildOggPage(idHeader, 0),
        ...buildOggPage(randomData, 1),
        ...buildOggPage(randomData, 2),
        ...buildOggPage(randomData, 3),
        ...buildOggPage(randomData, 4)
      ];

      const data = new Uint8Array(pages);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });
  });

  describe('Vorbis comment block edge cases', () => {
    it('should return empty for truncated vendor length', async () => {
      // Vorbis comment block with only 2 bytes (needs at least 4 for vendor length)
      const truncatedBlock = [0x01, 0x02];
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...truncatedBlock];

      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should return empty when comment count offset exceeds data', async () => {
      // Vendor string length points beyond data
      const vendorLen = 999;
      const block = writeUint32LE(vendorLen);
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...block, 0x00];

      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should stop parsing when comment length exceeds remaining data', async () => {
      // Build a comment block where second comment length overflows
      const vendorBytes = strToBytes('test');
      const comment1 = strToBytes('TITLE=OK');
      const block: number[] = [
        ...writeUint32LE(vendorBytes.length),
        ...vendorBytes,
        ...writeUint32LE(2), // claim 2 comments
        ...writeUint32LE(comment1.length),
        ...comment1,
        ...writeUint32LE(9999) // second comment length overflows
      ];
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...block];

      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result.title).toBe('OK');
    });
  });

  describe('FLAC metadata parsing', () => {
    it('should parse Vorbis comments from FLAC', async () => {
      const comments = buildVorbisCommentBlock([
        'TITLE=FLAC Title',
        'ARTIST=FLAC Artist',
        'ALBUM=FLAC Album'
      ]);

      // STREAMINFO block (type=0, is not last)
      const streamInfoSize = 34;
      const streamInfoBlock = [
        0x00, // not last, type=0
        ...[(streamInfoSize >> 16) & 0xff, (streamInfoSize >> 8) & 0xff, streamInfoSize & 0xff],
        ...new Array(streamInfoSize).fill(0)
      ];

      // VORBIS_COMMENT block (type=4, is last)
      const commentBlock = [
        0x84, // last block, type=4
        ...[(comments.length >> 16) & 0xff, (comments.length >> 8) & 0xff, comments.length & 0xff],
        ...comments
      ];

      const data = new Uint8Array([...strToBytes('fLaC'), ...streamInfoBlock, ...commentBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.title).toBe('FLAC Title');
      expect(result.artist).toBe('FLAC Artist');
      expect(result.album).toBe('FLAC Album');
    });

    it('should parse PICTURE block from FLAC', async () => {
      const comments = buildVorbisCommentBlock(['TITLE=With Image']);
      const commentBlock = buildFlacMetadataBlock(4, comments, false);

      const fakeImage = new Array(20).fill(0xff);
      const pictureData = buildFlacPictureData('image/png', '', fakeImage);
      const pictureBlock = buildFlacMetadataBlock(6, pictureData, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...commentBlock, ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.title).toBe('With Image');
      expect(result.image).toMatch(/^data:image\/png;base64,/);
    });

    it('should skip FLAC PICTURE with image data > 100KB', async () => {
      const comments = buildVorbisCommentBlock(['TITLE=Large Image']);
      const commentBlock = buildFlacMetadataBlock(4, comments, false);

      const largeImage = new Array(100 * 1024 + 1).fill(0xff);
      const pictureData = buildFlacPictureData('image/jpeg', '', largeImage);
      const pictureBlock = buildFlacMetadataBlock(6, pictureData, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...commentBlock, ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.title).toBe('Large Image');
      expect(result.image).toBeUndefined();
    });

    it('should skip unknown FLAC block types gracefully', async () => {
      const comments = buildVorbisCommentBlock(['TITLE=After Unknown']);
      // Unknown block type=99
      const unknownBlock = buildFlacMetadataBlock(99, new Array(10).fill(0), false);
      const commentBlock = buildFlacMetadataBlock(4, comments, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...unknownBlock, ...commentBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.title).toBe('After Unknown');
    });

    it('should stop at isLast block', async () => {
      const comments1 = buildVorbisCommentBlock(['TITLE=First']);
      const commentBlock1 = buildFlacMetadataBlock(4, comments1, true); // isLast=true

      const comments2 = buildVorbisCommentBlock(['ARTIST=Should Not Appear']);
      const commentBlock2 = buildFlacMetadataBlock(4, comments2, false);

      const data = new Uint8Array([...strToBytes('fLaC'), ...commentBlock1, ...commentBlock2]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.title).toBe('First');
      expect(result.artist).toBeUndefined();
    });

    it('should handle truncated FLAC block (blockSize exceeds data)', async () => {
      // FLAC header + block header claiming large size but data ends
      const blockHeader = [
        0x84, // last, type=4
        0x00,
        0x10,
        0x00 // blockSize = 4096, but no data follows
      ];
      const data = new Uint8Array([...strToBytes('fLaC'), ...blockHeader]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result).toEqual({});
    });

    it('should return empty for FLAC with only magic and no blocks', async () => {
      const data = new Uint8Array(strToBytes('fLaC'));
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result).toEqual({});
    });

    it('should only use first PICTURE block', async () => {
      const fakeImage1 = new Array(20).fill(0xaa);
      const pictureData1 = buildFlacPictureData('image/jpeg', '', fakeImage1);
      const pictureBlock1 = buildFlacMetadataBlock(6, pictureData1, false);

      const fakeImage2 = new Array(20).fill(0xbb);
      const pictureData2 = buildFlacPictureData('image/png', '', fakeImage2);
      const pictureBlock2 = buildFlacMetadataBlock(6, pictureData2, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...pictureBlock1, ...pictureBlock2]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should handle FLAC PICTURE with truncated MIME length', async () => {
      // PICTURE block with only picture type (4 bytes) and truncated MIME length
      const truncatedPicture = [...writeUint32BE(3), 0x00]; // only 1 byte for MIME len
      const pictureBlock = buildFlacMetadataBlock(6, truncatedPicture, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.image).toBeUndefined();
    });

    it('should handle FLAC PICTURE with truncated description length', async () => {
      const mime = 'image/jpeg';
      const mimeBytes = strToBytes(mime);
      const truncatedPicture = [
        ...writeUint32BE(3), // picture type
        ...writeUint32BE(mimeBytes.length),
        ...mimeBytes
        // No description length follows
      ];
      const pictureBlock = buildFlacMetadataBlock(6, truncatedPicture, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.image).toBeUndefined();
    });

    it('should handle FLAC PICTURE with truncated picture data length', async () => {
      const mime = 'image/jpeg';
      const mimeBytes = strToBytes(mime);
      const truncatedPicture = [
        ...writeUint32BE(3), // picture type
        ...writeUint32BE(mimeBytes.length),
        ...mimeBytes,
        ...writeUint32BE(0), // description length
        ...writeUint32BE(100), // width
        ...writeUint32BE(100), // height
        ...writeUint32BE(24), // color depth
        ...writeUint32BE(0) // colors used
        // No picture data length follows
      ];
      const pictureBlock = buildFlacMetadataBlock(6, truncatedPicture, true);

      const data = new Uint8Array([...strToBytes('fLaC'), ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.image).toBeUndefined();
    });

    it('should handle FLAC PICTURE too short (< 4 bytes)', async () => {
      const pictureBlock = buildFlacMetadataBlock(6, [0x00, 0x01], true);
      const data = new Uint8Array([...strToBytes('fLaC'), ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.image).toBeUndefined();
    });
  });

  describe('fetchAudioMetadata', () => {
    it('should return empty object for unknown format', async () => {
      const data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.wav');
      expect(result).toEqual({});
    });

    it('should return empty object for data shorter than 4 bytes', async () => {
      const data = new Uint8Array([0x00, 0x01]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });

    it('should return empty object for empty data', async () => {
      const data = new Uint8Array(0);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });

    it('should return empty object when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });

    it('should return empty object for non-ok/non-206 response', async () => {
      vi.stubGlobal('fetch', mockFetch(new Uint8Array(0), 404));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });

    it('should accept 200 OK response', async () => {
      const titlePayload = [0x03, ...strToBytes('OK Title')];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data, 200));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('OK Title');
    });

    it('should send Range header in request', async () => {
      const fetchMock = mockFetch(new Uint8Array(4));
      vi.stubGlobal('fetch', fetchMock);

      await fetchAudioMetadata('https://example.com/test.mp3');
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/test.mp3', {
        headers: { Range: 'bytes=0-262143' },
        redirect: 'manual'
      });
    });

    it('should return empty object for 500 server error', async () => {
      vi.stubGlobal('fetch', mockFetch(new Uint8Array(0), 500));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle truncated ID3v2 header (valid magic but no frames)', async () => {
      const data = buildId3v2Tag([]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result).toEqual({});
    });

    it('should handle Vorbis comment block with zero comments', async () => {
      const comments = buildVorbisCommentBlock([]);
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...comments];

      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result).toEqual({});
    });

    it('should handle Vorbis comment without equals sign', async () => {
      const comments = buildVorbisCommentBlock(['INVALIDCOMMENT', 'TITLE=Valid']);
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...comments];

      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result.title).toBe('Valid');
    });

    it('should handle case-insensitive Vorbis comment keys', async () => {
      const comments = buildVorbisCommentBlock(['title=Lower Case Title']);
      const vorbisHeader = [0x03, ...strToBytes('vorbis'), ...comments];

      const idHeader = [...strToBytes('\x01vorbis'), ...new Array(23).fill(0)];
      const page0 = buildOggPage(idHeader, 0);
      const page1 = buildOggPage(vorbisHeader, 1);

      const data = new Uint8Array([...page0, ...page1]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.ogg');
      expect(result.title).toBe('Lower Case Title');
    });

    it('should handle ID3v2 frame with zero size', async () => {
      // A frame with size 0 should break parsing (frameSize <= 0 check)
      const titlePayload = [0x03, ...strToBytes('Before Zero')];
      const validFrame = buildId3v2Frame('TIT2', titlePayload);
      // Manually build a zero-size frame
      const zeroFrame = [...strToBytes('TPE1'), ...writeUint32BE(0), 0x00, 0x00];

      const frames = [...validFrame, ...zeroFrame];
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Before Zero');
      expect(result.artist).toBeUndefined();
    });

    it('should handle UTF-16 text with null terminator in middle', async () => {
      const titlePayload = [
        0x01, // UTF-16
        0xff,
        0xfe, // BOM LE
        0x41,
        0x00, // 'A'
        0x00,
        0x00, // null terminator
        0x42,
        0x00 // 'B' — should not be included
      ];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('A');
    });

    it('should handle UTF-16 without BOM defaulting to LE', async () => {
      // encoding=1 (UTF-16), no BOM present (first 2 bytes are not BOM)
      const titlePayload = [
        0x01, // UTF-16
        0x48,
        0x00, // 'H' in LE (not a BOM)
        0x69,
        0x00 // 'i' in LE
      ];
      const frames = buildId3v2Frame('TIT2', titlePayload);
      const data = buildId3v2Tag(frames);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.mp3');
      expect(result.title).toBe('Hi');
    });
  });
});
