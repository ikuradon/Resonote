import { bech32 } from '@scure/base';
import { decode } from 'nostr-tools/nip19';
import type { ContentId } from '$shared/content/types.js';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://yabu.me',
  'wss://nos.lol',
  'wss://relay.nostr.wirednet.jp'
];

export type DecodedNip19 =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string }
  | null;

export function decodeNip19(str: string): DecodedNip19 {
  try {
    const decoded = decode(str);
    switch (decoded.type) {
      case 'npub':
        return { type: 'npub', pubkey: decoded.data };
      case 'nprofile':
        return { type: 'nprofile', pubkey: decoded.data.pubkey, relays: decoded.data.relays ?? [] };
      case 'nevent':
        return {
          type: 'nevent',
          eventId: decoded.data.id,
          relays: decoded.data.relays ?? [],
          author: decoded.data.author,
          kind: decoded.data.kind
        };
      case 'note':
        return { type: 'note', eventId: decoded.data };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function encodeContentLink(contentId: ContentId, relays: string[]): string {
  const contentStr = `${contentId.platform}:${contentId.type}:${contentId.id}`;
  const data: number[] = [];

  const contentBytes = new TextEncoder().encode(contentStr);
  data.push(0);
  data.push((contentBytes.length >> 8) & 0xff, contentBytes.length & 0xff);
  data.push(...contentBytes);

  for (const relay of relays) {
    const relayBytes = new TextEncoder().encode(relay);
    data.push(1);
    data.push((relayBytes.length >> 8) & 0xff, relayBytes.length & 0xff);
    data.push(...relayBytes);
  }

  const words = bech32.toWords(new Uint8Array(data));
  return bech32.encode('ncontent', words, 5000);
}

export function iTagToContentPath(iTagValue: string): string | null {
  const firstColon = iTagValue.indexOf(':');
  if (firstColon === -1) return null;
  const secondColon = iTagValue.indexOf(':', firstColon + 1);
  if (secondColon !== -1) {
    const platform = iTagValue.slice(0, firstColon);
    const type = iTagValue.slice(firstColon + 1, secondColon);
    const id = iTagValue.slice(secondColon + 1);
    return `/${platform}/${type}/${encodeURIComponent(id)}`;
  }
  const platform = iTagValue.slice(0, firstColon);
  const id = iTagValue.slice(firstColon + 1);
  return `/${platform}/track/${encodeURIComponent(id)}`;
}

export function getContentPathFromTags(tags: string[][]): string | null {
  const iTag = tags.find((tag) => tag[0] === 'I' && tag[1]);
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
