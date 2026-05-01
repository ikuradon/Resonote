import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP84_HIGHLIGHT_KIND = 9802;
export const NIP84_CONTEXT_TAG = 'context';
export const NIP84_COMMENT_TAG = 'comment';
export const NIP84_SOURCE_MARKER = 'source';
export const NIP84_MENTION_MARKER = 'mention';

export interface Nip84EventSourceInput {
  readonly eventId: string;
  readonly relayHint?: string | null;
  readonly marker?: string | null;
}

export interface Nip84EventSource {
  readonly eventId: string;
  readonly relayHint: string | null;
  readonly marker: string | null;
}

export interface Nip84AddressSourceInput {
  readonly address: string;
  readonly relayHint?: string | null;
  readonly marker?: string | null;
}

export interface Nip84AddressSource {
  readonly address: string;
  readonly relayHint: string | null;
  readonly marker: string | null;
}

export interface Nip84UrlSourceInput {
  readonly url: string;
  readonly marker?: string | null;
}

export interface Nip84UrlSource {
  readonly url: string;
  readonly marker: string | null;
}

export interface Nip84PubkeyAttributionInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
  readonly role?: string | null;
}

export interface Nip84PubkeyAttribution {
  readonly pubkey: string;
  readonly relayHint: string | null;
  readonly role: string | null;
}

export interface Nip84PubkeyMentionInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
}

export interface Nip84PubkeyMention {
  readonly pubkey: string;
  readonly relayHint: string | null;
}

export interface Nip84UrlMentionInput {
  readonly url: string;
}

export interface Nip84UrlMention {
  readonly url: string;
}

export interface BuildNip84HighlightEventInput {
  readonly content?: string;
  readonly eventSources?: readonly Nip84EventSourceInput[];
  readonly addressSources?: readonly Nip84AddressSourceInput[];
  readonly urlSources?: readonly Nip84UrlSourceInput[];
  readonly attributions?: readonly Nip84PubkeyAttributionInput[];
  readonly context?: string | null;
  readonly comment?: string | null;
  readonly pubkeyMentions?: readonly Nip84PubkeyMentionInput[];
  readonly urlMentions?: readonly Nip84UrlMentionInput[];
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip84HighlightEventSnapshot {
  readonly kind: typeof NIP84_HIGHLIGHT_KIND;
  readonly content: string;
  readonly eventSources: readonly Nip84EventSource[];
  readonly addressSources: readonly Nip84AddressSource[];
  readonly urlSources: readonly Nip84UrlSource[];
  readonly attributions: readonly Nip84PubkeyAttribution[];
  readonly context: string | null;
  readonly comment: string | null;
  readonly pubkeyMentions: readonly Nip84PubkeyMention[];
  readonly urlMentions: readonly Nip84UrlMention[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

const STRUCTURED_TAGS = new Set(['e', 'a', 'r', 'p', NIP84_CONTEXT_TAG, NIP84_COMMENT_TAG]);

export function buildNip84HighlightEvent(
  input: BuildNip84HighlightEventInput = {}
): EventParameters {
  const tags: string[][] = [
    ...(input.eventSources ?? []).map(buildNip84EventSourceTag),
    ...(input.addressSources ?? []).map(buildNip84AddressSourceTag),
    ...(input.urlSources ?? []).map(buildNip84SourceUrlTag),
    ...(input.attributions ?? []).map(buildNip84PubkeyAttributionTag)
  ];

  appendOptionalTag(tags, NIP84_CONTEXT_TAG, input.context);
  appendOptionalTag(tags, NIP84_COMMENT_TAG, input.comment);
  tags.push(...(input.pubkeyMentions ?? []).map(buildNip84PubkeyMentionTag));
  tags.push(...(input.urlMentions ?? []).map(buildNip84UrlMentionTag));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_TAGS.has(tag[0])));

  return {
    kind: NIP84_HIGHLIGHT_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip84EventSourceTag(input: Nip84EventSourceInput): string[] {
  const eventId = normalizeNonEmpty(input.eventId, 'event source id');
  return buildReferenceTag('e', eventId, input.relayHint, input.marker);
}

export function buildNip84AddressSourceTag(input: Nip84AddressSourceInput): string[] {
  const address = normalizeNonEmpty(input.address, 'address source');
  return buildReferenceTag('a', address, input.relayHint, input.marker);
}

export function buildNip84SourceUrlTag(input: Nip84UrlSourceInput): string[] {
  const url = normalizeNonEmpty(input.url, 'source URL');
  const marker = input.marker === undefined ? NIP84_SOURCE_MARKER : input.marker?.trim() || null;
  return marker ? ['r', url, marker] : ['r', url];
}

export function buildNip84PubkeyAttributionTag(input: Nip84PubkeyAttributionInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'attribution pubkey');
  const relayHint = input.relayHint?.trim();
  const role = input.role?.trim();
  if (role) return ['p', pubkey, relayHint || '', role];
  return relayHint ? ['p', pubkey, relayHint] : ['p', pubkey];
}

export function buildNip84PubkeyMentionTag(input: Nip84PubkeyMentionInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'mention pubkey');
  const relayHint = input.relayHint?.trim();
  return ['p', pubkey, relayHint || '', NIP84_MENTION_MARKER];
}

export function buildNip84UrlMentionTag(input: Nip84UrlMentionInput): string[] {
  return ['r', normalizeNonEmpty(input.url, 'mention URL'), NIP84_MENTION_MARKER];
}

export function isNip84HighlightEvent(event: Pick<NostrEvent, 'kind'>): boolean {
  return event.kind === NIP84_HIGHLIGHT_KIND;
}

export function parseNip84HighlightEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip84HighlightEventSnapshot | null {
  if (!isNip84HighlightEvent(event)) return null;

  return {
    kind: NIP84_HIGHLIGHT_KIND,
    content: event.content,
    eventSources: parseNip84EventSourceTags(event.tags),
    addressSources: parseNip84AddressSourceTags(event.tags),
    urlSources: parseNip84SourceUrlTags(event.tags),
    attributions: parseNip84PubkeyAttributions(event.tags),
    context: firstTagValue(event.tags, NIP84_CONTEXT_TAG),
    comment: firstTagValue(event.tags, NIP84_COMMENT_TAG),
    pubkeyMentions: parseNip84PubkeyMentions(event.tags),
    urlMentions: parseNip84UrlMentions(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip84EventSourceTags(
  tags: readonly (readonly string[])[]
): Nip84EventSource[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'e') return [];
    const eventId = tag[1]?.trim();
    if (!eventId) return [];
    return [
      {
        eventId,
        relayHint: tag[2]?.trim() || null,
        marker: tag[3]?.trim() || null
      }
    ];
  });
}

export function parseNip84AddressSourceTags(
  tags: readonly (readonly string[])[]
): Nip84AddressSource[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'a') return [];
    const address = tag[1]?.trim();
    if (!address) return [];
    return [
      {
        address,
        relayHint: tag[2]?.trim() || null,
        marker: tag[3]?.trim() || null
      }
    ];
  });
}

export function parseNip84SourceUrlTags(tags: readonly (readonly string[])[]): Nip84UrlSource[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'r' || tag[2]?.trim() === NIP84_MENTION_MARKER) return [];
    const url = tag[1]?.trim();
    if (!url) return [];
    return [
      {
        url,
        marker: tag[2]?.trim() || null
      }
    ];
  });
}

export function parseNip84PubkeyAttributions(
  tags: readonly (readonly string[])[]
): Nip84PubkeyAttribution[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'p' || tag[3]?.trim() === NIP84_MENTION_MARKER) return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    return [
      {
        pubkey,
        relayHint: tag[2]?.trim() || null,
        role: tag[3]?.trim() || null
      }
    ];
  });
}

export function parseNip84PubkeyMentions(
  tags: readonly (readonly string[])[]
): Nip84PubkeyMention[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'p' || tag[3]?.trim() !== NIP84_MENTION_MARKER) return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    return [
      {
        pubkey,
        relayHint: tag[2]?.trim() || null
      }
    ];
  });
}

export function parseNip84UrlMentions(tags: readonly (readonly string[])[]): Nip84UrlMention[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'r' || tag[2]?.trim() !== NIP84_MENTION_MARKER) return [];
    const url = tag[1]?.trim();
    return url ? [{ url }] : [];
  });
}

function buildReferenceTag(
  tagName: 'e' | 'a',
  value: string,
  relayHint: string | null | undefined,
  marker: string | null | undefined
): string[] {
  const normalizedRelay = relayHint?.trim();
  const normalizedMarker = marker?.trim();
  if (normalizedMarker) return [tagName, value, normalizedRelay || '', normalizedMarker];
  return normalizedRelay ? [tagName, value, normalizedRelay] : [tagName, value];
}

function appendOptionalTag(
  tags: string[][],
  tagName: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) tags.push([tagName, normalized]);
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value || null;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-84 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
