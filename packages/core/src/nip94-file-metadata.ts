import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIP94_FILE_METADATA_KIND = 1063;
export const NIP94_FILE_METADATA_TAGS = [
  'url',
  'm',
  'x',
  'ox',
  'size',
  'dim',
  'magnet',
  'i',
  'blurhash',
  'thumb',
  'image',
  'summary',
  'alt',
  'fallback',
  'service'
] as const;

export type Nip94FileMetadataTagName = (typeof NIP94_FILE_METADATA_TAGS)[number];

export interface Nip94PreviewResourceInput {
  readonly url: string;
  readonly hash?: string | null;
}

export interface Nip94PreviewResource {
  readonly url: string;
  readonly hash: string | null;
}

export interface Nip94Dimensions {
  readonly width: number;
  readonly height: number;
}

export interface BuildNip94FileMetadataInput {
  readonly url: string;
  readonly mediaType: string;
  readonly hash: string;
  readonly description?: string | null;
  readonly originalHash?: string | null;
  readonly size?: string | number | null;
  readonly dimensions?: string | null;
  readonly magnet?: string | null;
  readonly torrentInfoHash?: string | null;
  readonly blurhash?: string | null;
  readonly thumb?: string | Nip94PreviewResourceInput | null;
  readonly image?: string | Nip94PreviewResourceInput | null;
  readonly summary?: string | null;
  readonly alt?: string | null;
  readonly fallbacks?: readonly string[];
  readonly service?: string | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip94FileMetadataSnapshot {
  readonly kind: typeof NIP94_FILE_METADATA_KIND;
  readonly description: string;
  readonly url: string;
  readonly mediaType: string;
  readonly hash: string;
  readonly originalHash: string | null;
  readonly size: number | null;
  readonly sizeText: string | null;
  readonly dimensions: string | null;
  readonly parsedDimensions: Nip94Dimensions | null;
  readonly magnet: string | null;
  readonly torrentInfoHash: string | null;
  readonly blurhash: string | null;
  readonly thumb: Nip94PreviewResource | null;
  readonly image: Nip94PreviewResource | null;
  readonly summary: string | null;
  readonly alt: string | null;
  readonly fallbacks: readonly string[];
  readonly service: string | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNip94FileMetadataFilterInput {
  readonly hashes?: readonly string[];
  readonly mediaTypes?: readonly string[];
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

const STRUCTURED_TAGS = new Set<string>(NIP94_FILE_METADATA_TAGS);
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const DIMENSIONS_PATTERN = /^([1-9]\d*)x([1-9]\d*)$/;

export function buildNip94FileMetadataEvent(input: BuildNip94FileMetadataInput): EventParameters {
  const tags: string[][] = [
    buildNip94UrlTag(input.url),
    buildNip94MediaTypeTag(input.mediaType),
    buildNip94HashTag(input.hash)
  ];
  appendOptionalTag(tags, 'ox', normalizeOptionalSha256(input.originalHash, 'original file hash'));
  appendOptionalTag(tags, 'size', normalizeOptionalSize(input.size));
  appendOptionalTag(tags, 'dim', normalizeOptionalDimensions(input.dimensions));
  appendOptionalTag(tags, 'magnet', input.magnet);
  appendOptionalTag(tags, 'i', input.torrentInfoHash);
  appendOptionalTag(tags, 'blurhash', input.blurhash);
  appendOptionalResourceTag(tags, 'thumb', input.thumb);
  appendOptionalResourceTag(tags, 'image', input.image);
  appendOptionalTag(tags, 'summary', input.summary);
  appendOptionalTag(tags, 'alt', input.alt);
  tags.push(...(input.fallbacks ?? []).map(buildNip94FallbackTag));
  appendOptionalTag(tags, 'service', input.service);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_TAGS.has(tag[0])));

  return {
    kind: NIP94_FILE_METADATA_KIND,
    content: input.description ?? '',
    tags
  };
}

export function buildNip94UrlTag(url: string): string[] {
  return ['url', normalizeNonEmpty(url, 'file URL')];
}

export function buildNip94MediaTypeTag(mediaType: string): string[] {
  return ['m', normalizeMediaType(mediaType)];
}

export function buildNip94HashTag(hash: string): string[] {
  return ['x', normalizeSha256(hash, 'file hash')];
}

export function buildNip94OriginalHashTag(hash: string): string[] {
  return ['ox', normalizeSha256(hash, 'original file hash')];
}

export function buildNip94ThumbTag(input: string | Nip94PreviewResourceInput): string[] {
  return buildNip94ResourceTag('thumb', input);
}

export function buildNip94ImageTag(input: string | Nip94PreviewResourceInput): string[] {
  return buildNip94ResourceTag('image', input);
}

export function buildNip94FallbackTag(url: string): string[] {
  return ['fallback', normalizeNonEmpty(url, 'fallback URL')];
}

export function buildNip94FileMetadataFilter(
  input: BuildNip94FileMetadataFilterInput = {}
): Filter {
  const filter: Filter = { kinds: [NIP94_FILE_METADATA_KIND] };
  if (input.hashes?.length) {
    filter['#x'] = input.hashes.map((hash) => normalizeSha256(hash, 'file hash'));
  }
  if (input.mediaTypes?.length) {
    filter['#m'] = input.mediaTypes.map(normalizeMediaType);
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

export function parseNip94FileMetadataEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip94FileMetadataSnapshot | null {
  if (event.kind !== NIP94_FILE_METADATA_KIND) return null;
  const url = firstTagValue(event.tags, 'url');
  const mediaType = firstTagValue(event.tags, 'm');
  const hash = parseOptionalSha256(firstTagValue(event.tags, 'x'));
  if (!url || !mediaType || !hash) return null;
  const sizeText = firstTagValue(event.tags, 'size');
  const dimensions = firstTagValue(event.tags, 'dim');

  return {
    kind: NIP94_FILE_METADATA_KIND,
    description: event.content,
    url,
    mediaType,
    hash,
    originalHash: parseOptionalSha256(firstTagValue(event.tags, 'ox')),
    size: parseNonNegativeInteger(sizeText),
    sizeText,
    dimensions,
    parsedDimensions: parseNip94Dimensions(dimensions),
    magnet: firstTagValue(event.tags, 'magnet'),
    torrentInfoHash: firstTagValue(event.tags, 'i'),
    blurhash: firstTagValue(event.tags, 'blurhash'),
    thumb: parseNip94PreviewResourceTag(event.tags.find((tag) => tag[0] === 'thumb')),
    image: parseNip94PreviewResourceTag(event.tags.find((tag) => tag[0] === 'image')),
    summary: firstTagValue(event.tags, 'summary'),
    alt: firstTagValue(event.tags, 'alt'),
    fallbacks: parseTagValues(event.tags, 'fallback'),
    service: firstTagValue(event.tags, 'service'),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip94PreviewResourceTag(
  tag: readonly string[] | undefined
): Nip94PreviewResource | null {
  if (!tag || (tag[0] !== 'thumb' && tag[0] !== 'image')) return null;
  const url = tag[1]?.trim();
  if (!url) return null;
  return {
    url,
    hash: parseOptionalSha256(tag[2])
  };
}

export function parseNip94Dimensions(value: string | null | undefined): Nip94Dimensions | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const match = DIMENSIONS_PATTERN.exec(normalized);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function buildNip94ResourceTag(
  tagName: 'thumb' | 'image',
  input: string | Nip94PreviewResourceInput
): string[] {
  if (typeof input === 'string') {
    return [tagName, normalizeNonEmpty(input, `${tagName} URL`)];
  }
  const url = normalizeNonEmpty(input.url, `${tagName} URL`);
  const hash = normalizeOptionalSha256(input.hash, `${tagName} hash`);
  return hash ? [tagName, url, hash] : [tagName, url];
}

function appendOptionalTag(
  tags: string[][],
  tagName: Nip94FileMetadataTagName,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) tags.push([tagName, normalized]);
}

function appendOptionalResourceTag(
  tags: string[][],
  tagName: 'thumb' | 'image',
  value: string | Nip94PreviewResourceInput | null | undefined
): void {
  if (value !== undefined && value !== null) tags.push(buildNip94ResourceTag(tagName, value));
}

function parseTagValues(tags: readonly (readonly string[])[], tagName: string): string[] {
  return tags.flatMap((tag) => {
    const value = tag[0] === tagName ? tag[1]?.trim() : null;
    return value ? [value] : [];
  });
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  return parseTagValues(tags, tagName)[0] ?? null;
}

function normalizeMediaType(value: string): string {
  return normalizeNonEmpty(value, 'media type').toLowerCase();
}

function normalizeOptionalSha256(value: string | null | undefined, label: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalizeSha256(normalized, label);
}

function normalizeSha256(value: string, label: string): string {
  const normalized = normalizeNonEmpty(value, label);
  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new Error(`NIP-94 ${label} must be SHA-256 hex`);
  }
  return normalized.toLowerCase();
}

function normalizeOptionalSize(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return String(normalizePositiveInteger(normalized, 'file size'));
}

function normalizeOptionalDimensions(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!DIMENSIONS_PATTERN.test(normalized)) {
    throw new Error('NIP-94 dimensions must use <width>x<height>');
  }
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-94 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: string | number, label: string): number {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`NIP-94 ${label} must be a non-negative safe integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`NIP-94 ${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function parseOptionalSha256(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || !SHA256_HEX_PATTERN.test(normalized)) return null;
  return normalized.toLowerCase();
}

function parseNonNegativeInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-94 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
