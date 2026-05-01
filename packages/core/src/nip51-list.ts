import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP51_STANDARD_LIST_KINDS = [
  3, 10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10012, 10015, 10017,
  10018, 10020, 10030, 10050, 10101, 10102
] as const;

export const NIP51_SET_KINDS = [
  30000, 30002, 30003, 30004, 30005, 30006, 30007, 30008, 30015, 30030, 30063, 30267, 31924, 39089,
  39092
] as const;

export const NIP51_DEPRECATED_LIST_KINDS = [30000, 30001] as const;

export type Nip51StandardListKind = (typeof NIP51_STANDARD_LIST_KINDS)[number];
export type Nip51SetKind = (typeof NIP51_SET_KINDS)[number];
export type Nip51DeprecatedListKind = (typeof NIP51_DEPRECATED_LIST_KINDS)[number];
export type Nip51ListKind = Nip51StandardListKind | Nip51SetKind | Nip51DeprecatedListKind;
export type Nip51ListType = 'standard' | 'set' | 'deprecated';
export type Nip51PrivateContentEncryption = 'nip44' | 'nip04';

export interface Nip51ListMetadata {
  readonly identifier: string | null;
  readonly title: string | null;
  readonly image: string | null;
  readonly description: string | null;
}

export interface Nip51ListSnapshot {
  readonly kind: Nip51ListKind;
  readonly listType: Nip51ListType;
  readonly pubkey: string;
  readonly createdAt: number;
  readonly metadata: Nip51ListMetadata;
  readonly publicTags: string[][];
  readonly expectedPublicTagNames: readonly string[];
  readonly privateContent: string | null;
  readonly privateContentEncryption: Nip51PrivateContentEncryption | null;
}

export interface BuildNip51ListEventInput {
  readonly kind: Nip51ListKind;
  readonly publicTags?: readonly (readonly string[])[];
  readonly privateContent?: string | null;
  readonly metadata?: Partial<Nip51ListMetadata>;
}

const STANDARD_LIST_KIND_SET = new Set<number>(NIP51_STANDARD_LIST_KINDS);
const SET_KIND_SET = new Set<number>(NIP51_SET_KINDS);
const DEPRECATED_KIND_SET = new Set<number>(NIP51_DEPRECATED_LIST_KINDS);
const METADATA_TAG_NAMES = new Set(['d', 'title', 'image', 'description']);

const DEPRECATED_LIST_IDENTIFIERS = new Map<number, Set<string>>([
  [30000, new Set(['mute'])],
  [30001, new Set(['pin', 'bookmark', 'communities'])]
]);

const EXPECTED_TAG_NAMES = new Map<number, readonly string[]>([
  [3, ['p']],
  [10000, ['p', 't', 'word', 'e']],
  [10001, ['e']],
  [10002, ['r']],
  [10003, ['e', 'a']],
  [10004, ['a']],
  [10005, ['e']],
  [10006, ['relay']],
  [10007, ['relay']],
  [10008, ['a', 'e']],
  [10009, ['group', 'r']],
  [10012, ['relay', 'a']],
  [10015, ['t', 'a']],
  [10017, ['p']],
  [10018, ['a']],
  [10020, ['p']],
  [10030, ['emoji', 'a']],
  [10050, ['relay']],
  [10101, ['p']],
  [10102, ['relay']],
  [30000, ['p']],
  [30002, ['relay']],
  [30003, ['e', 'a']],
  [30004, ['a', 'e']],
  [30005, ['e']],
  [30006, ['e']],
  [30007, ['p']],
  [30008, ['a', 'e']],
  [30015, ['t']],
  [30030, ['emoji']],
  [30063, ['e', 'a']],
  [30267, ['a']],
  [31924, ['a']],
  [39089, ['p']],
  [39092, ['p']]
]);

const DEPRECATED_EXPECTED_TAG_NAMES = new Map<string, readonly string[]>([
  ['30000:mute', ['p', 't', 'word', 'e']],
  ['30001:pin', ['e']],
  ['30001:bookmark', ['e', 'a']],
  ['30001:communities', ['a']]
]);

export function isNip51StandardListKind(kind: number): kind is Nip51StandardListKind {
  return STANDARD_LIST_KIND_SET.has(kind);
}

export function isNip51SetKind(kind: number): kind is Nip51SetKind {
  return SET_KIND_SET.has(kind);
}

export function isNip51ListKind(kind: number): kind is Nip51ListKind {
  return isNip51StandardListKind(kind) || isNip51SetKind(kind) || DEPRECATED_KIND_SET.has(kind);
}

export function isNip51MetadataTag(tag: readonly string[]): boolean {
  return METADATA_TAG_NAMES.has(tag[0] ?? '');
}

export function parseNip51ListEvent(
  event: Pick<NostrEvent, 'kind' | 'pubkey' | 'created_at' | 'tags' | 'content'>
): Nip51ListSnapshot | null {
  const metadata = parseNip51ListMetadata(event.tags);
  const listType = getNip51ListType(event.kind, metadata.identifier);
  if (listType === null) return null;
  if ((listType === 'set' || listType === 'deprecated') && !metadata.identifier) return null;

  return {
    kind: event.kind as Nip51ListKind,
    listType,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    metadata,
    publicTags: parseNip51PublicTags(event.tags),
    expectedPublicTagNames: getNip51ExpectedPublicTagNames(event.kind, metadata.identifier),
    privateContent: event.content ? event.content : null,
    privateContentEncryption: event.content
      ? detectNip51PrivateContentEncryption(event.content)
      : null
  };
}

export function parseNip51ListMetadata(tags: readonly (readonly string[])[]): Nip51ListMetadata {
  return {
    identifier: firstTagValue(tags, 'd'),
    title: firstTagValue(tags, 'title'),
    image: firstTagValue(tags, 'image'),
    description: firstTagValue(tags, 'description')
  };
}

export function parseNip51PublicTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.flatMap((tag) => {
    if (isNip51MetadataTag(tag)) return [];
    const normalized = normalizeNip51ListTag(tag);
    return normalized ? [normalized] : [];
  });
}

export function parseNip51PrivateTagsJson(plaintext: string): string[][] | null {
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return null;
    const tags: string[][] = [];
    for (const item of parsed) {
      if (!Array.isArray(item)) return null;
      const normalized = normalizeNip51ListTag(item);
      if (!normalized) return null;
      tags.push(normalized);
    }
    return tags;
  } catch {
    return null;
  }
}

export function stringifyNip51PrivateTags(tags: readonly (readonly string[])[]): string {
  return JSON.stringify(assertNip51ListTags(tags));
}

export function detectNip51PrivateContentEncryption(
  content: string
): Nip51PrivateContentEncryption {
  return content.includes('?iv=') || content.includes('&iv=') ? 'nip04' : 'nip44';
}

export function buildNip51ListEvent(input: BuildNip51ListEventInput): EventParameters {
  const identifier = normalizeOptionalValue(input.metadata?.identifier);
  const listType = getNip51ListType(input.kind, identifier);
  if (listType === null) {
    throw new Error(`Unsupported NIP-51 list kind: ${input.kind}`);
  }
  if ((listType === 'set' || listType === 'deprecated') && !identifier) {
    throw new Error(`NIP-51 kind:${input.kind} requires a d tag identifier`);
  }

  const tags: string[][] = [];
  if (identifier) tags.push(['d', identifier]);
  appendMetadataTag(tags, 'title', input.metadata?.title);
  appendMetadataTag(tags, 'image', input.metadata?.image);
  appendMetadataTag(tags, 'description', input.metadata?.description);
  tags.push(...assertNip51ListTags(input.publicTags ?? []));

  return {
    kind: input.kind,
    tags,
    content: input.privateContent ?? ''
  };
}

export function appendNip51ListTag(
  tags: readonly (readonly string[])[],
  tag: readonly string[]
): string[][] {
  return [...copyTags(tags), assertNip51ListTag(tag)];
}

export function removeNip51ListTags(
  tags: readonly (readonly string[])[],
  predicate: (tag: readonly string[]) => boolean
): string[][] {
  return tags.filter((tag) => !predicate(tag)).map((tag) => [...tag]);
}

export function getNip51ExpectedPublicTagNames(
  kind: number,
  identifier?: string | null
): readonly string[] {
  if (identifier) {
    const deprecated = DEPRECATED_EXPECTED_TAG_NAMES.get(`${kind}:${identifier}`);
    if (deprecated) return deprecated;
  }
  return EXPECTED_TAG_NAMES.get(kind) ?? [];
}

function getNip51ListType(kind: number, identifier: string | null): Nip51ListType | null {
  const deprecatedIdentifiers = DEPRECATED_LIST_IDENTIFIERS.get(kind);
  if (identifier && deprecatedIdentifiers?.has(identifier)) return 'deprecated';
  if (isNip51StandardListKind(kind)) return 'standard';
  if (isNip51SetKind(kind)) return 'set';
  return null;
}

function firstTagValue(tags: readonly (readonly string[])[], name: string): string | null {
  for (const tag of tags) {
    if (tag[0] !== name) continue;
    return normalizeOptionalValue(tag[1]);
  }
  return null;
}

function appendMetadataTag(tags: string[][], name: string, value: string | null | undefined): void {
  const normalized = normalizeOptionalValue(value);
  if (normalized) tags.push([name, normalized]);
}

function assertNip51ListTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map(assertNip51ListTag);
}

function assertNip51ListTag(tag: readonly string[]): string[] {
  const normalized = normalizeNip51ListTag(tag);
  if (!normalized) {
    throw new Error('NIP-51 list tags require a tag name and value');
  }
  return normalized;
}

function normalizeNip51ListTag(tag: readonly unknown[]): string[] | null {
  if (!Array.isArray(tag) || tag.length < 2) return null;
  if (tag.some((value) => typeof value !== 'string')) return null;
  const [name, value] = tag;
  if (!name || !value) return null;
  return [...(tag as string[])];
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
