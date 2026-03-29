import type { EventParameters } from 'nostr-typedef';

import type { ContentId, ContentProvider } from '$shared/content/types.js';
import { extractShortcode, isShortcode } from '$shared/utils/emoji.js';

import { extractContentTags } from './content-parser.js';

export const METADATA_KIND = 0;
export const SHORT_TEXT_KIND = 1;
export const COMMENT_KIND = 1111;
export const REACTION_KIND = 7;
export const DELETION_KIND = 5;
export const FOLLOW_KIND = 3;
export const MUTE_KIND = 10000;
export const RELAY_LIST_KIND = 10002;
export const BOOKMARK_KIND = 10003;
export const CONTENT_REACTION_KIND = 17;
const COMMENT_KIND_STR = String(COMMENT_KIND);

function resolveContentInfo(provider: ContentProvider, contentId: ContentId) {
  const [value, hint] = provider.toNostrTag(contentId);
  return { value, hint, kind: provider.contentKind(contentId) };
}

export function formatPosition(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function parsePosition(str: string): number | null {
  const secMatch = str.match(/^(\d+)$/);
  if (secMatch) return parseInt(secMatch[1], 10) * 1000;

  const mmssMatch = str.match(/^(\d+):(\d{2})$/);
  if (mmssMatch) return (parseInt(mmssMatch[1], 10) * 60 + parseInt(mmssMatch[2], 10)) * 1000;

  return null;
}

const HASHTAG_RE = /(?:^|(?<=\s))#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)/g;

/**
 * @deprecated Use extractContentTags from '$shared/nostr/content-parser.js' instead.
 * Note: unlike extractContentTags, this function does not filter out hex-string or digit-only tags.
 */
export function extractHashtags(content: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  HASHTAG_RE.lastIndex = 0;
  while ((match = HASHTAG_RE.exec(content)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

function appendContentTags(tags: string[][], content: string, emojiTags?: string[][]): void {
  if (emojiTags) {
    tags.push(...emojiTags);
  }

  const { pTags, qTags, tTags } = extractContentTags(content);

  const existingP = new Set(tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1]));
  for (const pubkey of pTags) {
    if (!existingP.has(pubkey)) {
      tags.push(['p', pubkey]);
    }
  }

  const existingQ = new Set(tags.filter((tag) => tag[0] === 'q').map((tag) => tag[1]));
  for (const eventId of qTags) {
    if (!existingQ.has(eventId)) {
      tags.push(['q', eventId]);
    }
  }

  const existingT = new Set(tags.filter((tag) => tag[0] === 't').map((tag) => tag[1]));
  for (const hashtag of tTags) {
    if (!existingT.has(hashtag)) {
      tags.push(['t', hashtag]);
    }
  }
}

export interface CommentOptions {
  positionMs?: number;
  emojiTags?: string[][];
  parentEvent?: { id: string; pubkey: string; relayHint?: string };
  contentWarning?: string;
}

export function buildComment(
  content: string,
  contentId: ContentId,
  provider: ContentProvider,
  options?: CommentOptions
): EventParameters {
  const { positionMs, emojiTags, parentEvent } = options ?? {};
  const { value, hint, kind } = resolveContentInfo(provider, contentId);

  const tags: string[][] = [
    ['I', value, hint],
    ['K', kind]
  ];

  if (parentEvent) {
    tags.push(
      ['e', parentEvent.id, parentEvent.relayHint ?? '', parentEvent.pubkey],
      ['k', COMMENT_KIND_STR],
      ...(parentEvent.relayHint
        ? [['p', parentEvent.pubkey, parentEvent.relayHint]]
        : [['p', parentEvent.pubkey]])
    );
  } else {
    tags.push(['i', value, hint], ['k', kind]);
  }

  if (positionMs !== undefined && positionMs > 0) {
    tags.push(['position', String(Math.floor(positionMs / 1000))]);
  }

  appendContentTags(tags, content, emojiTags);

  if (options?.contentWarning !== undefined) {
    tags.push(['content-warning', options.contentWarning]);
  }

  return {
    kind: COMMENT_KIND,
    content,
    tags
  };
}

export function buildDeletion(
  targetEventIds: string[],
  contentId: ContentId,
  provider: ContentProvider,
  targetKind?: number
): EventParameters {
  const [value, hint] = provider.toNostrTag(contentId);
  const tags: string[][] = targetEventIds.map((id) => ['e', id]);
  tags.push(['I', value, hint]);
  if (targetKind !== undefined) {
    tags.push(['k', String(targetKind)]);
  }
  return {
    kind: DELETION_KIND,
    content: '',
    tags
  };
}

export function extractDeletionTargets(event: { tags: string[][] }): string[] {
  return event.tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1]);
}

export function buildShare(
  content: string,
  contentId: ContentId,
  provider: ContentProvider,
  emojiTags?: string[][]
): EventParameters {
  const { value, hint, kind } = resolveContentInfo(provider, contentId);
  const tags: string[][] = [
    ['i', value, hint],
    ['k', kind]
  ];

  appendContentTags(tags, content, emojiTags);

  return {
    kind: SHORT_TEXT_KIND,
    content,
    tags
  };
}

export function buildContentReaction(
  contentId: ContentId,
  provider: ContentProvider
): EventParameters {
  const { value, hint, kind } = resolveContentInfo(provider, contentId);
  return {
    kind: CONTENT_REACTION_KIND,
    content: '+',
    tags: [
      ['i', value, hint],
      ['k', kind],
      ['r', hint]
    ]
  };
}

export function buildReaction(
  targetEventId: string,
  targetPubkey: string,
  contentId: ContentId,
  provider: ContentProvider,
  reaction = '+',
  emojiUrl?: string,
  relayHint?: string
): EventParameters {
  const [idValue, idHint] = provider.toNostrTag(contentId);
  const tags: string[][] = [
    relayHint
      ? ['e', targetEventId, relayHint, targetPubkey]
      : ['e', targetEventId, '', targetPubkey],
    relayHint ? ['p', targetPubkey, relayHint] : ['p', targetPubkey],
    ['k', COMMENT_KIND_STR],
    ['I', idValue, idHint]
  ];

  if (emojiUrl && isShortcode(reaction)) {
    tags.push(['emoji', extractShortcode(reaction), emojiUrl]);
  }

  return {
    kind: REACTION_KIND,
    content: reaction,
    tags
  };
}
