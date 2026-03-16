/**
 * Minimal audio metadata parser for Cloudflare Workers.
 * Parses ID3v2 (MP3), Vorbis comments (OGG/OPUS), FLAC metadata.
 * Uses Range requests to avoid downloading entire files.
 */

import { assertSafeUrl } from './url-validation.js';

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  /** Cover art as data URL (data:image/jpeg;base64,...) */
  image?: string;
}

const RANGE_SIZE = 256 * 1024; // 256KB — enough for most ID3v2 + cover art

export async function fetchAudioMetadata(url: string): Promise<AudioMetadata> {
  try {
    assertSafeUrl(url);
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${RANGE_SIZE - 1}` }
    });
    if (!res.ok && res.status !== 206) return {};
    const buf = await res.arrayBuffer();
    const data = new Uint8Array(buf);

    if (data.length < 4) return {};

    // ID3v2 (MP3): starts with "ID3"
    if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
      return parseId3v2(data);
    }

    // OGG: starts with "OggS"
    if (data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53) {
      return parseOggVorbisComment(data);
    }

    // FLAC: starts with "fLaC"
    if (data[0] === 0x66 && data[1] === 0x4c && data[2] === 0x61 && data[3] === 0x43) {
      return parseFlacMetadata(data);
    }

    return {};
  } catch {
    return {};
  }
}

// --- ID3v2 Parser ---

function parseId3v2(data: Uint8Array): AudioMetadata {
  if (data.length < 10) return {};

  const flags = data[5];
  const size = syncsafeInt(data, 6);
  const hasExtHeader = (flags & 0x40) !== 0;

  let offset = 10;
  if (hasExtHeader && offset + 4 <= data.length) {
    const extSize = syncsafeInt(data, offset);
    offset += extSize;
  }

  const end = Math.min(10 + size, data.length);
  const meta: AudioMetadata = {};
  const version = data[3]; // 3 = ID3v2.3, 4 = ID3v2.4

  while (offset + 10 <= end) {
    const frameId = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3]
    );
    if (frameId === '\0\0\0\0') break;

    const frameSize =
      version === 4
        ? syncsafeInt(data, offset + 4)
        : (data[offset + 4] << 24) |
          (data[offset + 5] << 16) |
          (data[offset + 6] << 8) |
          data[offset + 7];

    const frameStart = offset + 10;
    const frameEnd = Math.min(frameStart + frameSize, end);
    offset = frameEnd;

    if (frameSize <= 0 || frameStart >= end) break;

    const frameData = data.subarray(frameStart, frameEnd);

    switch (frameId) {
      case 'TIT2':
        meta.title = decodeId3Text(frameData);
        break;
      case 'TPE1':
        meta.artist = decodeId3Text(frameData);
        break;
      case 'TALB':
        meta.album = decodeId3Text(frameData);
        break;
      case 'APIC':
        meta.image = decodeApic(frameData);
        break;
    }
  }

  return meta;
}

function syncsafeInt(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] & 0x7f) << 21) |
    ((data[offset + 1] & 0x7f) << 14) |
    ((data[offset + 2] & 0x7f) << 7) |
    (data[offset + 3] & 0x7f)
  );
}

function decodeId3Text(frame: Uint8Array): string {
  if (frame.length < 2) return '';
  const encoding = frame[0];
  const textBytes = frame.subarray(1);

  switch (encoding) {
    case 0: // ISO-8859-1
      return Array.from(textBytes)
        .filter((b) => b !== 0)
        .map((b) => String.fromCharCode(b))
        .join('');
    case 1: // UTF-16 with BOM
    case 2: // UTF-16BE
      return decodeUtf16(textBytes, encoding === 2);
    case 3: // UTF-8
      return new TextDecoder('utf-8').decode(textBytes).replace(/\0/g, '');
    default:
      return new TextDecoder('utf-8').decode(textBytes).replace(/\0/g, '');
  }
}

function decodeUtf16(data: Uint8Array, forceBE: boolean): string {
  let offset = 0;
  let le = !forceBE;
  if (!forceBE && data.length >= 2) {
    if (data[0] === 0xff && data[1] === 0xfe) {
      le = true;
      offset = 2;
    } else if (data[0] === 0xfe && data[1] === 0xff) {
      le = false;
      offset = 2;
    }
  }
  const chars: string[] = [];
  for (let i = offset; i + 1 < data.length; i += 2) {
    const code = le ? data[i] | (data[i + 1] << 8) : (data[i] << 8) | data[i + 1];
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

function decodeApic(frame: Uint8Array): string | undefined {
  if (frame.length < 4) return undefined;
  const encoding = frame[0];
  let offset = 1;

  // Read MIME type (null-terminated ASCII)
  const mimeEnd = frame.indexOf(0, offset);
  if (mimeEnd === -1) return undefined;
  const mime = Array.from(frame.subarray(offset, mimeEnd))
    .map((b) => String.fromCharCode(b))
    .join('');
  offset = mimeEnd + 1;

  // Picture type (1 byte)
  offset += 1;

  // Description (null-terminated, encoding-dependent)
  if (encoding === 0 || encoding === 3) {
    const descEnd = frame.indexOf(0, offset);
    if (descEnd === -1) return undefined;
    offset = descEnd + 1;
  } else {
    // UTF-16: look for double null
    while (offset + 1 < frame.length) {
      if (frame[offset] === 0 && frame[offset + 1] === 0) {
        offset += 2;
        break;
      }
      offset += 2;
    }
  }

  const imageData = frame.subarray(offset);
  if (imageData.length < 10) return undefined;

  // Limit cover art to 100KB to keep response reasonable
  if (imageData.length > 100 * 1024) return undefined;

  const mimeType = mime || 'image/jpeg';
  const base64 = uint8ToBase64(imageData);
  return `data:${mimeType};base64,${base64}`;
}

// --- OGG Vorbis Comment Parser ---

function parseOggVorbisComment(data: Uint8Array): AudioMetadata {
  // OGG pages: find the comment header (second packet in Vorbis, or OpusTags)
  let offset = 0;
  let packetIndex = 0;

  while (offset + 27 < data.length) {
    if (
      data[offset] !== 0x4f ||
      data[offset + 1] !== 0x67 ||
      data[offset + 2] !== 0x67 ||
      data[offset + 3] !== 0x53
    )
      break;

    const segments = data[offset + 26];
    if (offset + 27 + segments > data.length) break;

    let pageSize = 0;
    for (let i = 0; i < segments; i++) {
      pageSize += data[offset + 27 + i];
    }

    const pageDataStart = offset + 27 + segments;
    const pageData = data.subarray(pageDataStart, pageDataStart + pageSize);

    // Second page typically contains comments
    if (packetIndex >= 1) {
      // Check for Vorbis comment header (starts with \x03vorbis)
      if (
        pageData.length > 7 &&
        pageData[0] === 0x03 &&
        String.fromCharCode(...pageData.subarray(1, 7)) === 'vorbis'
      ) {
        return parseVorbisCommentBlock(pageData.subarray(7));
      }
      // Check for OpusTags
      if (pageData.length > 8 && String.fromCharCode(...pageData.subarray(0, 8)) === 'OpusTags') {
        return parseVorbisCommentBlock(pageData.subarray(8));
      }
    }

    offset = pageDataStart + pageSize;
    packetIndex++;
    if (packetIndex > 3) break;
  }

  return {};
}

function parseVorbisCommentBlock(data: Uint8Array): AudioMetadata {
  const meta: AudioMetadata = {};
  let offset = 0;

  if (offset + 4 > data.length) return meta;
  const vendorLen = readUint32LE(data, offset);
  offset += 4 + vendorLen;

  if (offset + 4 > data.length) return meta;
  const commentCount = readUint32LE(data, offset);
  offset += 4;

  for (let i = 0; i < commentCount && offset + 4 <= data.length; i++) {
    const len = readUint32LE(data, offset);
    offset += 4;
    if (offset + len > data.length) break;

    const comment = new TextDecoder('utf-8').decode(data.subarray(offset, offset + len));
    offset += len;

    const eq = comment.indexOf('=');
    if (eq === -1) continue;
    const key = comment.slice(0, eq).toUpperCase();
    const value = comment.slice(eq + 1);

    switch (key) {
      case 'TITLE':
        meta.title = value;
        break;
      case 'ARTIST':
        meta.artist = value;
        break;
      case 'ALBUM':
        meta.album = value;
        break;
    }
  }

  return meta;
}

// --- FLAC Metadata Parser ---

function parseFlacMetadata(data: Uint8Array): AudioMetadata {
  let offset = 4; // Skip "fLaC"
  const meta: AudioMetadata = {};

  while (offset + 4 <= data.length) {
    const isLast = (data[offset] & 0x80) !== 0;
    const blockType = data[offset] & 0x7f;
    const blockSize = (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    offset += 4;

    if (offset + blockSize > data.length) break;

    // 4 = VORBIS_COMMENT
    if (blockType === 4) {
      Object.assign(meta, parseVorbisCommentBlock(data.subarray(offset, offset + blockSize)));
    }

    // 6 = PICTURE
    if (blockType === 6 && !meta.image) {
      const pic = parseFlacPicture(data.subarray(offset, offset + blockSize));
      if (pic) meta.image = pic;
    }

    offset += blockSize;
    if (isLast) break;
  }

  return meta;
}

function parseFlacPicture(data: Uint8Array): string | undefined {
  let offset = 0;
  if (offset + 4 > data.length) return undefined;

  // Picture type (4 bytes BE)
  offset += 4;

  // MIME type length + string
  if (offset + 4 > data.length) return undefined;
  const mimeLen = readUint32BE(data, offset);
  offset += 4;
  if (offset + mimeLen > data.length) return undefined;
  const mime = new TextDecoder('ascii').decode(data.subarray(offset, offset + mimeLen));
  offset += mimeLen;

  // Description length + string
  if (offset + 4 > data.length) return undefined;
  const descLen = readUint32BE(data, offset);
  offset += 4 + descLen;

  // Width, height, color depth, colors used (16 bytes)
  offset += 16;

  // Picture data length + data
  if (offset + 4 > data.length) return undefined;
  const picLen = readUint32BE(data, offset);
  offset += 4;
  if (offset + picLen > data.length || picLen > 100 * 1024) return undefined;

  const imageData = data.subarray(offset, offset + picLen);
  return `data:${mime};base64,${uint8ToBase64(imageData)}`;
}

// --- Helpers ---

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  );
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
