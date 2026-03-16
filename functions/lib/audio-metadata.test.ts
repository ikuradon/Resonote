import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function buildId3v2Tag(frames: number[]): Uint8Array {
  const header = [
    ...strToBytes('ID3'), // magic
    0x03,
    0x00, // version 2.3, revision 0
    0x00, // flags (no ext header)
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
      const commentBlock = [
        0x04, // not last, type=4
        ...[(comments.length >> 16) & 0xff, (comments.length >> 8) & 0xff, comments.length & 0xff],
        ...comments
      ];

      // Build PICTURE block (type=6)
      const mime = 'image/png';
      const mimeBytes = strToBytes(mime);
      const desc = '';
      const descBytes = strToBytes(desc);
      const fakeImage = new Array(20).fill(0xff); // 20 bytes of fake image data
      const pictureData = [
        ...writeUint32BE(3), // picture type: front cover
        ...writeUint32BE(mimeBytes.length),
        ...mimeBytes,
        ...writeUint32BE(descBytes.length),
        ...descBytes,
        ...writeUint32BE(100), // width
        ...writeUint32BE(100), // height
        ...writeUint32BE(24), // color depth
        ...writeUint32BE(0), // colors used
        ...writeUint32BE(fakeImage.length),
        ...fakeImage
      ];

      const pictureBlock = [
        0x86, // last block, type=6
        ...[
          (pictureData.length >> 16) & 0xff,
          (pictureData.length >> 8) & 0xff,
          pictureData.length & 0xff
        ],
        ...pictureData
      ];

      const data = new Uint8Array([...strToBytes('fLaC'), ...commentBlock, ...pictureBlock]);
      vi.stubGlobal('fetch', mockFetch(data));

      const result = await fetchAudioMetadata('https://example.com/test.flac');
      expect(result.title).toBe('With Image');
      expect(result.image).toMatch(/^data:image\/png;base64,/);
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
        headers: { Range: 'bytes=0-262143' }
      });
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
  });
});
