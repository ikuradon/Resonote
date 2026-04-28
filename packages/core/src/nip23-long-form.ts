import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP23_LONG_FORM_KIND = 30023;
export const NIP23_LONG_FORM_DRAFT_KIND = 30024;
export const NIP23_LONG_FORM_KINDS = [NIP23_LONG_FORM_KIND, NIP23_LONG_FORM_DRAFT_KIND] as const;

export type Nip23LongFormKind = (typeof NIP23_LONG_FORM_KINDS)[number];

export interface Nip23LongFormMetadata {
  readonly identifier: string;
  readonly title: string | null;
  readonly image: string | null;
  readonly summary: string | null;
  readonly publishedAt: number | null;
  readonly topics: readonly string[];
}

export interface Nip23LongFormSnapshot {
  readonly kind: Nip23LongFormKind;
  readonly content: string;
  readonly metadata: Nip23LongFormMetadata;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly tags: readonly string[][];
  readonly referenceTags: readonly string[][];
  readonly customTags: readonly string[][];
}

export interface BuildNip23LongFormInput {
  readonly identifier: string;
  readonly content: string;
  readonly kind?: Nip23LongFormKind;
  readonly createdAt?: number;
  readonly title?: string | null;
  readonly image?: string | null;
  readonly summary?: string | null;
  readonly publishedAt?: number | null;
  readonly topics?: readonly string[];
  readonly tags?: readonly (readonly string[])[];
}

const LONG_FORM_KIND_SET = new Set<number>(NIP23_LONG_FORM_KINDS);
const METADATA_TAG_NAMES = new Set(['d', 'title', 'image', 'summary', 'published_at', 't']);
const REFERENCE_TAG_NAMES = new Set(['a', 'e', 'p', 'q', 'r']);

export function isNip23LongFormKind(kind: number): kind is Nip23LongFormKind {
  return LONG_FORM_KIND_SET.has(kind);
}

export function buildNip23LongFormEvent(input: BuildNip23LongFormInput): EventParameters {
  const kind = input.kind ?? NIP23_LONG_FORM_KIND;
  if (!isNip23LongFormKind(kind)) {
    throw new Error(`Unsupported NIP-23 long-form kind: ${kind}`);
  }

  const tags: string[][] = [['d', normalizeIdentifier(input.identifier)]];
  appendOptionalTag(tags, 'title', input.title);
  appendOptionalTag(tags, 'image', input.image);
  appendOptionalTag(tags, 'summary', input.summary);
  if (input.publishedAt !== undefined && input.publishedAt !== null) {
    assertTimestamp(input.publishedAt, 'published_at');
    tags.push(['published_at', String(input.publishedAt)]);
  }
  for (const topic of input.topics ?? []) {
    const normalized = topic.trim();
    if (normalized) tags.push(['t', normalized]);
  }
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !METADATA_TAG_NAMES.has(tag[0])));

  return {
    kind,
    created_at: input.createdAt,
    content: input.content,
    tags
  };
}

export function parseNip23LongFormEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip23LongFormSnapshot | null {
  if (!isNip23LongFormKind(event.kind)) return null;

  const metadata = parseNip23LongFormMetadata(event.tags);
  if (!metadata) return null;

  const tags = copyTags(event.tags);
  return {
    kind: event.kind,
    content: event.content,
    metadata,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    tags,
    referenceTags: tags.filter((tag) => REFERENCE_TAG_NAMES.has(tag[0])),
    customTags: tags.filter(
      (tag) => !METADATA_TAG_NAMES.has(tag[0]) && !REFERENCE_TAG_NAMES.has(tag[0])
    )
  };
}

export function parseNip23LongFormMetadata(
  tags: readonly (readonly string[])[]
): Nip23LongFormMetadata | null {
  const identifier = firstTagValue(tags, 'd');
  if (!identifier) return null;
  const publishedAt = parsePublishedAt(firstTagValue(tags, 'published_at'));
  if (publishedAt === undefined) return null;

  return {
    identifier,
    title: firstTagValue(tags, 'title'),
    image: firstTagValue(tags, 'image'),
    summary: firstTagValue(tags, 'summary'),
    publishedAt,
    topics: [
      ...new Set(
        tags.filter((tag) => tag[0] === 't' && Boolean(tag[1]?.trim())).map((tag) => tag[1].trim())
      )
    ]
  };
}

function appendOptionalTag(
  tags: string[][],
  tagName: 'title' | 'image' | 'summary',
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) tags.push([tagName, normalized]);
}

function normalizeIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('NIP-23 long-form identifier must not be empty');
  return normalized;
}

function parsePublishedAt(value: string | null): number | null | undefined {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-23 ${label} must be a non-negative safe integer`);
  }
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value || null;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
