import { bech32 } from '@scure/base';
import type { ContentId } from '../content/types.js';

// TLV format:
// type 0 (special): content ID string ("spotify:track:abc123")
// type 1 (relay): relay URL string (repeatable)
// length: 2 bytes big-endian

export function encodeContentLink(contentId: ContentId, relays: string[]): string {
  const contentStr = `${contentId.platform}:${contentId.type}:${contentId.id}`;
  const data: number[] = [];

  // TLV type 0: content ID
  const contentBytes = new TextEncoder().encode(contentStr);
  data.push(0); // type
  data.push((contentBytes.length >> 8) & 0xff, contentBytes.length & 0xff); // length (2 bytes BE)
  data.push(...contentBytes);

  // TLV type 1: relay URLs
  for (const relay of relays) {
    const relayBytes = new TextEncoder().encode(relay);
    data.push(1);
    data.push((relayBytes.length >> 8) & 0xff, relayBytes.length & 0xff);
    data.push(...relayBytes);
  }

  const words = bech32.toWords(new Uint8Array(data));
  return bech32.encode('ncontent', words, 5000);
}

/** Parse an I-tag value ("platform:type:id") to a URL path ("/platform/type/id"). */
export function iTagToContentPath(iTagValue: string): string | null {
  const i1 = iTagValue.indexOf(':');
  const i2 = iTagValue.indexOf(':', i1 + 1);
  if (i1 === -1 || i2 === -1) return null;
  return `/${iTagValue.slice(0, i1)}/${iTagValue.slice(i1 + 1, i2)}/${iTagValue.slice(i2 + 1)}`;
}

/** Extract content path from event tags. Looks for ["I", value, ...] tag. */
export function getContentPathFromTags(tags: string[][]): string | null {
  const iTag = tags.find((t) => t[0] === 'I' && t[1]);
  return iTag ? iTagToContentPath(iTag[1]) : null;
}

export function decodeContentLink(str: string): { contentId: ContentId; relays: string[] } | null {
  try {
    if (!str.includes('1')) return null;
    const { prefix, bytes } = bech32.decodeToBytes(str as `${string}1${string}`);
    if (prefix !== 'ncontent') return null;

    let contentStr = '';
    const relays: string[] = [];
    const decoder = new TextDecoder();

    let i = 0;
    while (i < bytes.length) {
      const type = bytes[i];
      const length = (bytes[i + 1] << 8) | bytes[i + 2];
      const value = bytes.slice(i + 3, i + 3 + length);

      if (type === 0) {
        contentStr = decoder.decode(value);
      } else if (type === 1) {
        relays.push(decoder.decode(value));
      }

      i += 3 + length;
    }

    if (!contentStr) return null;

    // Parse content ID: split on first two colons
    const firstColon = contentStr.indexOf(':');
    const secondColon = contentStr.indexOf(':', firstColon + 1);
    if (firstColon === -1 || secondColon === -1) return null;

    const contentId: ContentId = {
      platform: contentStr.slice(0, firstColon),
      type: contentStr.slice(firstColon + 1, secondColon),
      id: contentStr.slice(secondColon + 1)
    };

    return { contentId, relays };
  } catch {
    return null;
  }
}
