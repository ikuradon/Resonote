import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIPC7_CHAT_MESSAGE_KIND = 9;
export const NIPC7_REPLY_QUOTE_TAG = 'q';

export interface NipC7ReplyReferenceInput {
  readonly eventId: string;
  readonly relayHint?: string | null;
  readonly pubkey?: string | null;
}

export interface NipC7ReplyReference {
  readonly eventId: string;
  readonly relayHint: string | null;
  readonly pubkey: string | null;
  readonly tag: readonly string[];
}

export interface BuildNipC7ChatMessageInput {
  readonly content: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNipC7ChatReplyInput extends BuildNipC7ChatMessageInput {
  readonly parent: NipC7ReplyReferenceInput;
}

export interface NipC7ChatMessageSnapshot {
  readonly kind: typeof NIPC7_CHAT_MESSAGE_KIND;
  readonly content: string;
  readonly reply: NipC7ReplyReference | null;
  readonly quotes: readonly NipC7ReplyReference[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNipC7ChatMessageFilterInput {
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

export function isNipC7ChatMessageKind(kind: number): kind is typeof NIPC7_CHAT_MESSAGE_KIND {
  return kind === NIPC7_CHAT_MESSAGE_KIND;
}

export function buildNipC7ChatMessage(input: BuildNipC7ChatMessageInput): EventParameters {
  return {
    kind: NIPC7_CHAT_MESSAGE_KIND,
    content: normalizeNonEmpty(input.content, 'message content'),
    tags: copyTags(input.tags ?? []).filter((tag) => tag[0] !== NIPC7_REPLY_QUOTE_TAG)
  };
}

export function buildNipC7ChatReply(input: BuildNipC7ChatReplyInput): EventParameters {
  return {
    kind: NIPC7_CHAT_MESSAGE_KIND,
    content: normalizeNonEmpty(input.content, 'message content'),
    tags: [
      buildNipC7ReplyQuoteTag(input.parent),
      ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== NIPC7_REPLY_QUOTE_TAG)
    ]
  };
}

export function buildNipC7ReplyQuoteTag(input: NipC7ReplyReferenceInput): string[] {
  const eventId = normalizeNonEmpty(input.eventId, 'reply event id');
  const relayHint = input.relayHint?.trim();
  const pubkey = input.pubkey?.trim();
  if (pubkey) return [NIPC7_REPLY_QUOTE_TAG, eventId, relayHint ?? '', pubkey];
  if (relayHint) return [NIPC7_REPLY_QUOTE_TAG, eventId, relayHint];
  return [NIPC7_REPLY_QUOTE_TAG, eventId];
}

export function buildNipC7ChatMessageFilter(input: BuildNipC7ChatMessageFilterInput = {}): Filter {
  const filter: Filter = { kinds: [NIPC7_CHAT_MESSAGE_KIND] };
  if (input.authors?.length) {
    filter.authors = input.authors.map((author) => normalizeNonEmpty(author, 'author pubkey'));
  }
  if (input.since !== undefined && input.since !== null) {
    filter.since = normalizeTimestamp(input.since, 'filter since');
  }
  if (input.until !== undefined && input.until !== null) {
    filter.until = normalizeTimestamp(input.until, 'filter until');
  }
  if (input.limit !== undefined && input.limit !== null) {
    filter.limit = normalizePositiveInteger(input.limit, 'filter limit');
  }
  return filter;
}

export function parseNipC7ChatMessage(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): NipC7ChatMessageSnapshot | null {
  if (!isNipC7ChatMessageKind(event.kind)) return null;
  if (!event.content.trim()) return null;
  const quotes = parseNipC7ReplyQuoteTags(event.tags);
  return {
    kind: NIPC7_CHAT_MESSAGE_KIND,
    content: event.content,
    reply: quotes[0] ?? null,
    quotes,
    customTags: copyTags(event.tags).filter((tag) => tag[0] !== NIPC7_REPLY_QUOTE_TAG),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNipC7ReplyQuoteTags(
  tags: readonly (readonly string[])[]
): NipC7ReplyReference[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== NIPC7_REPLY_QUOTE_TAG) return [];
    const eventId = tag[1]?.trim();
    if (!eventId) return [];
    const relayHint = tag[2]?.trim() || null;
    const pubkey = tag[3]?.trim() || null;
    return [{ eventId, relayHint, pubkey, tag: [...tag] }];
  });
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-C7 ${label} must be non-empty`);
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-C7 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-C7 ${label} must be a positive safe integer`);
  }
  return value;
}
