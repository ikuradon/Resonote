import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

import { buildNip40ExpirationTag, parseNip40Expiration } from './nip40-expiration.js';
import type { Filter } from './relay-request.js';

export const NIP38_USER_STATUS_KIND = 30315;
export const NIP38_STATUS_TYPES = ['general', 'music'] as const;
export const NIP38_LINK_TAGS = ['r', 'p', 'e', 'a'] as const;

export type Nip38KnownStatusType = (typeof NIP38_STATUS_TYPES)[number];
export type Nip38StatusType = Nip38KnownStatusType | string;
export type Nip38StatusLinkTagName = (typeof NIP38_LINK_TAGS)[number];

export interface Nip38StatusLinkInput {
  readonly tagName: Nip38StatusLinkTagName;
  readonly value: string;
  readonly relayHint?: string | null;
}

export interface BuildNip38UserStatusEventInput {
  readonly statusType: Nip38StatusType;
  readonly content?: string;
  readonly links?: readonly Nip38StatusLinkInput[];
  readonly expiration?: number | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip38UserStatusFilterInput {
  readonly authors?: readonly string[];
  readonly statusTypes?: readonly string[];
  readonly limit?: number | null;
}

export interface Nip38StatusLink {
  readonly tagName: Nip38StatusLinkTagName;
  readonly value: string;
  readonly relayHint: string | null;
}

export interface Nip38UserStatusSnapshot {
  readonly statusType: string;
  readonly content: string;
  readonly clear: boolean;
  readonly expiration: number | null;
  readonly links: readonly Nip38StatusLink[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly customTags: readonly string[][];
}

const LINK_TAGS = new Set<string>(NIP38_LINK_TAGS);

export function buildNip38UserStatusEvent(input: BuildNip38UserStatusEventInput): EventParameters {
  const statusType = normalizeNip38StatusType(input.statusType);
  const tags: string[][] = [['d', statusType], ...(input.links ?? []).map(buildNip38StatusLinkTag)];

  if (input.expiration !== undefined && input.expiration !== null) {
    tags.push(buildNip40ExpirationTag(input.expiration));
  }

  tags.push(...copyTags(input.tags ?? []).filter((tag) => !['d', 'expiration'].includes(tag[0])));

  return {
    kind: NIP38_USER_STATUS_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip38ClearStatusEvent(
  statusType: Nip38StatusType,
  tags: readonly (readonly string[])[] = []
): EventParameters {
  return buildNip38UserStatusEvent({ statusType, content: '', tags });
}

export function buildNip38StatusLinkTag(input: Nip38StatusLinkInput): string[] {
  if (!isNip38StatusLinkTagName(input.tagName)) {
    throw new Error(`Unsupported NIP-38 status link tag: ${input.tagName}`);
  }
  const value = normalizeNonEmpty(input.value, 'status link value');
  const relayHint = input.relayHint?.trim();
  return relayHint ? [input.tagName, value, relayHint] : [input.tagName, value];
}

export function parseNip38UserStatusEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip38UserStatusSnapshot | null {
  if (event.kind !== NIP38_USER_STATUS_KIND) return null;

  const statusType = parseNip38StatusType(event);
  if (!statusType) return null;

  const links = parseNip38StatusLinks(event);
  return {
    statusType,
    content: event.content,
    clear: isNip38StatusClear(event),
    expiration: parseNip40Expiration(event),
    links,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    customTags: copyTags(event.tags).filter(
      (tag) => tag[0] !== 'd' && tag[0] !== 'expiration' && !isNip38StatusLinkTagName(tag[0])
    )
  };
}

export function parseNip38StatusType(event: Pick<NostrEvent, 'tags'>): string | null {
  return event.tags.find((tag) => tag[0] === 'd')?.[1]?.trim() || null;
}

export function parseNip38StatusLinks(event: Pick<NostrEvent, 'tags'>): Nip38StatusLink[] {
  return event.tags.flatMap((tag) => {
    const tagName = tag[0];
    if (!isNip38StatusLinkTagName(tagName)) return [];
    const value = tag[1]?.trim();
    if (!value) return [];
    return [
      {
        tagName,
        value,
        relayHint: tag[2]?.trim() || null
      }
    ];
  });
}

export function buildNip38UserStatusFilter(input: BuildNip38UserStatusFilterInput = {}): Filter {
  const filter: Filter = { kinds: [NIP38_USER_STATUS_KIND] };
  const authors = normalizeOptionalStringList(input.authors);
  const statusTypes = normalizeOptionalStringList(input.statusTypes);

  if (authors.length > 0) filter.authors = authors;
  if (statusTypes.length > 0) filter['#d'] = statusTypes;
  if (input.limit !== undefined && input.limit !== null) {
    assertPositiveSafeInteger(input.limit, 'filter limit');
    filter.limit = input.limit;
  }

  return filter;
}

export function isNip38UserStatusEvent(event: Pick<NostrEvent, 'kind'>): boolean {
  return event.kind === NIP38_USER_STATUS_KIND;
}

export function isNip38StatusClear(event: Pick<NostrEvent, 'content'>): boolean {
  return event.content === '';
}

export function isNip38KnownStatusType(value: string): value is Nip38KnownStatusType {
  return (NIP38_STATUS_TYPES as readonly string[]).includes(value);
}

export function isNip38StatusLinkTagName(value: string): value is Nip38StatusLinkTagName {
  return LINK_TAGS.has(value);
}

function normalizeNip38StatusType(value: string): string {
  return normalizeNonEmpty(value, 'status type');
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-38 ${label} must not be empty`);
  return normalized;
}

function normalizeOptionalStringList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`NIP-38 ${label} must be a positive safe integer`);
  }
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
