import { decodeNip19 as decode } from '@auftakt/core';
import { bech32 } from '@scure/base';

import type { ContentId } from '$shared/content/types.js';

const PRODUCTION_RELAYS = [
  'wss://relay.damus.io',
  'wss://yabu.me',
  'wss://nos.lol',
  'wss://relay.nostr.wirednet.jp'
];

/** @internal Exported for testing only */
export function parseRelayOverride(raw: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((r) => typeof r === 'string')) {
      return parsed;
    }
  } catch {
    /* fall through to production relays */
  }
  return null;
}

/**
 * Default relay list. Overridable via VITE_DEFAULT_RELAYS env var at build time.
 * E2E tests inject .test TLD relays to prevent event leaks to real relays.
 */
export const DEFAULT_RELAYS: string[] =
  (import.meta.env.VITE_DEFAULT_RELAYS &&
    parseRelayOverride(import.meta.env.VITE_DEFAULT_RELAYS)) ??
  PRODUCTION_RELAYS;

export type DecodedNip19 =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string }
  | null;

export function decodeNip19(str: string): DecodedNip19 {
  return decode(str);
}

/**
 * Encode a ContentId + relay list into a bech32 `ncontent1...` string.
 *
 * **Resonote-specific extension** — not part of the NIP-19 standard.
 * Other Nostr clients cannot decode this format.
 *
 * TLV structure:
 * - Type 0: content identifier string (`platform:type:id`)
 * - Type 1: relay URL (repeatable)
 */
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

/** Extract the first value for a given tag name, or undefined if absent. */
export function findTagValue(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

export function getContentPathFromTags(tags: string[][]): string | null {
  const iValue = findTagValue(tags, 'I');
  return iValue ? iTagToContentPath(iValue) : null;
}

/**
 * Decode a bech32 `ncontent1...` string into a ContentId + relay list.
 *
 * **Resonote-specific extension** — not part of the NIP-19 standard.
 * Returns null if the input is invalid or uses a different prefix.
 */
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
