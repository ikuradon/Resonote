import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

import { buildNip40ExpirationTag, parseNip40Expiration } from './nip40-expiration.js';
import type { Nip92MediaAttachment, Nip92MediaAttachmentInput } from './nip92-media-attachments.js';
import {
  parseNip92MediaAttachments,
  withNip92MediaAttachments
} from './nip92-media-attachments.js';

export const NIPA4_PUBLIC_MESSAGE_KIND = 24;
export const NIPA4_RECEIVER_TAG = 'p';
export const NIPA4_QUOTE_TAG = 'q';
export const NIPA4_RESPONSE_KIND_TAG = 'k';
export const NIPA4_FORBIDDEN_EVENT_TAG = 'e';

export interface NipA4ReceiverInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
}

export interface NipA4Receiver {
  readonly pubkey: string;
  readonly relayHint: string | null;
  readonly tag: readonly string[];
}

export interface NipA4QuoteInput {
  readonly value: string;
  readonly relayHint?: string | null;
  readonly pubkey?: string | null;
}

export interface NipA4Quote {
  readonly value: string;
  readonly relayHint: string | null;
  readonly pubkey: string | null;
  readonly tag: readonly string[];
}

export interface BuildNipA4PublicMessageInput {
  readonly content: string;
  readonly receivers: readonly NipA4ReceiverInput[];
  readonly expiration?: number | null;
  readonly quotes?: readonly NipA4QuoteInput[];
  readonly attachments?: readonly Nip92MediaAttachmentInput[];
  readonly tags?: readonly (readonly string[])[];
  readonly requireAttachmentContentMatch?: boolean;
}

export interface NipA4PublicMessageSnapshot {
  readonly kind: typeof NIPA4_PUBLIC_MESSAGE_KIND;
  readonly content: string;
  readonly receivers: readonly NipA4Receiver[];
  readonly expiration: number | null;
  readonly quotes: readonly NipA4Quote[];
  readonly attachments: readonly Nip92MediaAttachment[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNipA4PublicMessageFilterInput {
  readonly receivers?: readonly string[];
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

const STRUCTURED_TAGS = new Set<string>([
  NIPA4_RECEIVER_TAG,
  NIPA4_QUOTE_TAG,
  NIPA4_RESPONSE_KIND_TAG,
  NIPA4_FORBIDDEN_EVENT_TAG,
  'expiration',
  'imeta'
]);

export function isNipA4PublicMessageKind(kind: number): kind is typeof NIPA4_PUBLIC_MESSAGE_KIND {
  return kind === NIPA4_PUBLIC_MESSAGE_KIND;
}

export function buildNipA4PublicMessage(input: BuildNipA4PublicMessageInput): EventParameters {
  const content = normalizeNonEmpty(input.content, 'message content');
  if (input.receivers.length === 0) {
    throw new Error('NIP-A4 public messages require at least one receiver p tag');
  }

  const attachmentTags = withNip92MediaAttachments({
    content,
    attachments: input.attachments ?? [],
    requireContentMatch: input.requireAttachmentContentMatch ?? true
  }).tags;
  const expirationTag =
    input.expiration === undefined || input.expiration === null
      ? []
      : [buildNip40ExpirationTag(input.expiration)];

  return {
    kind: NIPA4_PUBLIC_MESSAGE_KIND,
    content,
    tags: [
      ...input.receivers.map(buildNipA4ReceiverTag),
      ...expirationTag,
      ...(input.quotes ?? []).map(buildNipA4QuoteTag),
      ...attachmentTags,
      ...copyCustomTags(input.tags ?? [])
    ]
  };
}

export function buildNipA4ReceiverTag(input: NipA4ReceiverInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'receiver pubkey');
  const relayHint = input.relayHint?.trim();
  return relayHint ? [NIPA4_RECEIVER_TAG, pubkey, relayHint] : [NIPA4_RECEIVER_TAG, pubkey];
}

export function buildNipA4QuoteTag(input: NipA4QuoteInput): string[] {
  const value = normalizeNonEmpty(input.value, 'quote target');
  const relayHint = input.relayHint?.trim();
  const pubkey = input.pubkey?.trim();
  if (pubkey) return [NIPA4_QUOTE_TAG, value, relayHint ?? '', pubkey];
  if (relayHint) return [NIPA4_QUOTE_TAG, value, relayHint];
  return [NIPA4_QUOTE_TAG, value];
}

export function buildNipA4ResponseKindTag(): string[] {
  return [NIPA4_RESPONSE_KIND_TAG, String(NIPA4_PUBLIC_MESSAGE_KIND)];
}

export function buildNipA4PublicMessageFilter(
  input: BuildNipA4PublicMessageFilterInput = {}
): Filter {
  const filter: Filter = { kinds: [NIPA4_PUBLIC_MESSAGE_KIND] };
  if (input.receivers?.length) {
    filter['#p'] = input.receivers.map((receiver) =>
      normalizeNonEmpty(receiver, 'receiver pubkey')
    );
  }
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

export function parseNipA4PublicMessage(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): NipA4PublicMessageSnapshot | null {
  if (!isNipA4PublicMessageKind(event.kind)) return null;
  if (hasNipA4ForbiddenEventTags(event.tags)) return null;
  const receivers = parseNipA4Receivers(event.tags);
  if (receivers.length === 0) return null;

  return {
    kind: NIPA4_PUBLIC_MESSAGE_KIND,
    content: event.content,
    receivers,
    expiration: parseNip40Expiration(event),
    quotes: parseNipA4Quotes(event.tags),
    attachments: parseNip92MediaAttachments(event, {
      requireContentMatch: true,
      uniqueByUrl: true
    }),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNipA4Receivers(tags: readonly (readonly string[])[]): NipA4Receiver[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== NIPA4_RECEIVER_TAG) return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    const relayHint = tag[2]?.trim() || null;
    return [{ pubkey, relayHint, tag: [...tag] }];
  });
}

export function parseNipA4Quotes(tags: readonly (readonly string[])[]): NipA4Quote[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== NIPA4_QUOTE_TAG) return [];
    const value = tag[1]?.trim();
    if (!value) return [];
    const relayHint = tag[2]?.trim() || null;
    const pubkey = tag[3]?.trim() || null;
    return [{ value, relayHint, pubkey, tag: [...tag] }];
  });
}

export function hasNipA4ForbiddenEventTags(tags: readonly (readonly string[])[]): boolean {
  return tags.some((tag) => tag[0] === NIPA4_FORBIDDEN_EVENT_TAG);
}

function copyCustomTags(tags: readonly (readonly string[])[]): string[][] {
  return copyTags(tags)
    .map((tag) => {
      if (tag[0] === NIPA4_FORBIDDEN_EVENT_TAG) {
        throw new Error('NIP-A4 public messages must not use e tags');
      }
      return tag;
    })
    .filter((tag) => !STRUCTURED_TAGS.has(tag[0]));
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-A4 ${label} must be non-empty`);
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-A4 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-A4 ${label} must be a positive safe integer`);
  }
  return value;
}
