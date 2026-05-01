import { extractNip27References } from '@auftakt/core';

import { getProvider } from '$shared/content/registry.js';
import type { ContentId } from '$shared/content/types.js';
import { isEmojiTag } from '$shared/utils/emoji.js';
import { sanitizeUrl } from '$shared/utils/url.js';

import { decodeContentLink, type DecodedNip19, decodeNip19 } from './helpers.js';

export type { DecodedNip19 };

export type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; shortcode: string; url: string }
  | { type: 'nostr-link'; uri: string; decoded: LinkableNip19; href: string }
  | {
      type: 'content-link';
      uri: string;
      contentId: ContentId;
      href: string;
      displayLabel: string;
    }
  | { type: 'url'; href: string }
  | { type: 'hashtag'; tag: string };

type LinkableNip19 = Extract<
  NonNullable<DecodedNip19>,
  { type: 'npub' | 'nprofile' | 'note' | 'nevent' }
>;

const NSEC_RE = /nsec1[a-z0-9]{58}/i;

/**
 * Returns true if content contains a Nostr private key (nsec1...).
 * Used as a security guard before sending comments.
 */
export function containsPrivateKey(content: string): boolean {
  return NSEC_RE.test(content);
}

// Hex character set
const HEX_CHARS = '0123456789abcdefABCDEF';

function isHexString(s: string): boolean {
  if (s.length !== 64) return false;
  for (const c of s) {
    if (!HEX_CHARS.includes(c)) return false;
  }
  return true;
}

function isDigitsOnly(s: string): boolean {
  return /^\d+$/.test(s);
}

// Combined regex pattern - match priority order:
// 1. nostr: URIs (excluding nsec1)
// 2. URLs
// 3. Emoji shortcodes
// 4. Hashtags
// Created fresh per call to avoid shared lastIndex state
function createCombinedRe(): RegExp {
  return /nostr:(npub1|nprofile1|nevent1|note1|ncontent1)[a-z0-9]+|https?:\/\/[^\s<>"]+|:([A-Za-z0-9_]+):|(?:^|(?<=\s))#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)/g;
}

/** Trim trailing punctuation from a URL, preserving balanced parentheses. */
function trimUrlTrailing(url: string): string {
  let end = url.length;
  while (end > 0 && /[.,;:!?)]/.test(url[end - 1])) {
    if (url[end - 1] === ')') {
      const sub = url.slice(0, end);
      const opens = (sub.match(/\(/g) ?? []).length;
      const closes = (sub.match(/\)/g) ?? []).length;
      if (opens >= closes) break;
    }
    end--;
  }
  return url.slice(0, end);
}

function nostrLinkHref(uri: string, decoded: LinkableNip19): string {
  switch (decoded.type) {
    case 'npub':
    case 'nprofile':
      return `/profile/${uri}`;
    case 'note':
    case 'nevent':
      return `/${uri}`;
  }
}

function isLinkableNip19(decoded: NonNullable<DecodedNip19>): decoded is LinkableNip19 {
  return ['npub', 'nprofile', 'note', 'nevent'].includes(decoded.type);
}

function contentLinkHref(contentId: ContentId): string {
  return `/${encodeURIComponent(contentId.platform)}/${encodeURIComponent(
    contentId.type
  )}/${encodeURIComponent(contentId.id)}`;
}

/**
 * Parse comment content into structured segments.
 * Handles emoji shortcodes, nostr: URIs, URLs, and hashtags.
 */
export function parseCommentContent(content: string, emojiTags: string[][]): ContentSegment[] {
  if (!content) return [];

  // Build emoji map
  const emojiMap = new Map<string, string>();
  for (const tag of emojiTags) {
    if (isEmojiTag(tag)) {
      const safeUrl = sanitizeUrl(tag[2]);
      if (safeUrl) emojiMap.set(tag[1], safeUrl);
    }
  }

  const segments: ContentSegment[] = [];
  const re = createCombinedRe();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const matchStart = match.index;
    const matchText = match[0];

    // Push text before this match
    if (matchStart > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, matchStart)
      });
    }

    if (matchText.startsWith('nostr:')) {
      // Nostr URI
      const uri = matchText.slice('nostr:'.length);
      if (uri.startsWith('ncontent1')) {
        // ncontent1 -> content-link
        const result = decodeContentLink(uri);
        if (result) {
          const { contentId } = result;
          const provider = getProvider(contentId.platform);
          const displayLabel = provider?.displayName ?? contentId.platform;
          segments.push({
            type: 'content-link',
            uri,
            contentId,
            href: contentLinkHref(contentId),
            displayLabel
          });
        } else {
          segments.push({ type: 'text', value: matchText });
        }
      } else {
        // Other nostr: prefixes -> nostr-link
        const decoded = decodeNip19(uri);
        if (decoded && isLinkableNip19(decoded)) {
          segments.push({
            type: 'nostr-link',
            uri,
            decoded,
            href: nostrLinkHref(uri, decoded)
          });
        } else {
          segments.push({ type: 'text', value: matchText });
        }
      }
      lastIndex = matchStart + matchText.length;
    } else if (matchText.startsWith('http://') || matchText.startsWith('https://')) {
      // URL -- trim trailing punctuation
      const trimmed = trimUrlTrailing(matchText);
      segments.push({ type: 'url', href: trimmed });
      lastIndex = matchStart + trimmed.length;
      re.lastIndex = matchStart + trimmed.length;
    } else if (matchText.startsWith(':')) {
      // Emoji shortcode
      const shortcode = match[2];
      const url = emojiMap.get(shortcode);
      if (url) {
        segments.push({ type: 'emoji', shortcode, url });
      } else {
        segments.push({ type: 'text', value: matchText });
      }
      lastIndex = matchStart + matchText.length;
    } else if (matchText.includes('#')) {
      // Hashtag — lookbehind ensures matchText always starts with #
      const tag = match[3];

      // Exclude #<64 hex chars> and #<digits only>
      if (isHexString(tag) || isDigitsOnly(tag)) {
        segments.push({ type: 'text', value: matchText });
      } else {
        segments.push({ type: 'hashtag', tag });
      }
      lastIndex = matchStart + matchText.length;
    }
  }

  // Remaining text
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}

/**
 * Extract p/e/t tags from comment content for Nostr event building.
 * - nostr:npub1.../nostr:nprofile1... -> pTags (hex pubkeys)
 * - nostr:nevent1.../nostr:note1... -> qTags (event IDs)
 * - #hashtag -> tTags
 */
export interface QTagEntry {
  eventId: string;
  relayHint?: string;
}

export function extractContentTags(content: string): {
  pTags: string[];
  qTags: QTagEntry[];
  tTags: string[];
} {
  const pSet = new Set<string>();
  const qMap = new Map<string, QTagEntry>();
  const tSet = new Set<string>();

  for (const reference of extractNip27References(content)) {
    const decoded = reference.decoded;
    switch (decoded.type) {
      case 'npub':
        pSet.add(decoded.pubkey);
        break;
      case 'nprofile':
        pSet.add(decoded.pubkey);
        break;
      case 'nevent':
        if (!qMap.has(decoded.eventId)) {
          qMap.set(decoded.eventId, {
            eventId: decoded.eventId,
            relayHint: decoded.relays[0]
          });
        }
        break;
      case 'note':
        if (!qMap.has(decoded.eventId)) {
          qMap.set(decoded.eventId, { eventId: decoded.eventId });
        }
        break;
      case 'naddr':
      case 'nrelay':
        break;
    }
  }

  // Match hashtags
  const hashRe = /(?:^|(?<=\s))#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)/g;
  let match: RegExpExecArray | null;
  while ((match = hashRe.exec(content)) !== null) {
    const tag = match[1];
    if (!isHexString(tag) && !isDigitsOnly(tag)) {
      tSet.add(tag.toLowerCase());
    }
  }

  return {
    pTags: [...pSet],
    qTags: [...qMap.values()],
    tTags: [...tSet]
  };
}
