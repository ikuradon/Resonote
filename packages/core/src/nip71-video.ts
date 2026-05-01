import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP71_VIDEO_KIND = 21;
export const NIP71_SHORT_VIDEO_KIND = 22;
export const NIP71_ADDRESSABLE_VIDEO_KIND = 34235;
export const NIP71_ADDRESSABLE_SHORT_VIDEO_KIND = 34236;
export const NIP71_VIDEO_KINDS = [
  NIP71_VIDEO_KIND,
  NIP71_SHORT_VIDEO_KIND,
  NIP71_ADDRESSABLE_VIDEO_KIND,
  NIP71_ADDRESSABLE_SHORT_VIDEO_KIND
] as const;
export const NIP71_ADDRESSABLE_VIDEO_KINDS = [
  NIP71_ADDRESSABLE_VIDEO_KIND,
  NIP71_ADDRESSABLE_SHORT_VIDEO_KIND
] as const;
export const NIP71_IMETA_TAG = 'imeta';

export type Nip71VideoKind = (typeof NIP71_VIDEO_KINDS)[number];
export type Nip71AddressableVideoKind = (typeof NIP71_ADDRESSABLE_VIDEO_KINDS)[number];

export interface Nip71VideoVariantInput {
  readonly url: string;
  readonly mediaType: string;
  readonly dimensions?: string | null;
  readonly hash?: string | null;
  readonly blurhash?: string | null;
  readonly images?: readonly string[];
  readonly fallbacks?: readonly string[];
  readonly service?: string | null;
  readonly bitrate?: string | number | null;
  readonly duration?: string | number | null;
  readonly fields?: readonly Nip71ImetaFieldInput[];
}

export interface Nip71VideoVariant {
  readonly url: string;
  readonly mediaType: string;
  readonly dimensions: string | null;
  readonly hash: string | null;
  readonly blurhash: string | null;
  readonly images: readonly string[];
  readonly fallbacks: readonly string[];
  readonly service: string | null;
  readonly bitrate: number | null;
  readonly duration: number | null;
  readonly fields: readonly Nip71ImetaField[];
  readonly tag: readonly string[];
}

export interface Nip71ImetaFieldInput {
  readonly name: string;
  readonly value: string;
}

export interface Nip71ImetaField {
  readonly name: string;
  readonly value: string;
}

export interface Nip71TextTrackInput {
  readonly value: string;
  readonly trackType?: string | null;
  readonly language?: string | null;
  readonly relayHints?: readonly string[];
}

export interface Nip71TextTrack {
  readonly value: string;
  readonly trackType: string | null;
  readonly language: string | null;
  readonly relayHints: readonly string[];
}

export interface Nip71SegmentInput {
  readonly start: string;
  readonly end: string;
  readonly title: string;
  readonly thumbnailUrl?: string | null;
}

export interface Nip71Segment {
  readonly start: string;
  readonly end: string;
  readonly title: string;
  readonly thumbnailUrl: string | null;
}

export interface Nip71ParticipantInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
}

export interface Nip71Participant {
  readonly pubkey: string;
  readonly relayHint: string | null;
}

export interface Nip71OriginInput {
  readonly platform: string;
  readonly externalId: string;
  readonly originalUrl: string;
  readonly metadata?: string | null;
}

export interface Nip71Origin {
  readonly platform: string;
  readonly externalId: string;
  readonly originalUrl: string;
  readonly metadata: string | null;
}

export interface Nip71AddressPointerInput {
  readonly kind: Nip71AddressableVideoKind;
  readonly pubkey: string;
  readonly identifier: string;
  readonly relayHint?: string | null;
}

export interface Nip71AddressPointer {
  readonly kind: Nip71AddressableVideoKind;
  readonly pubkey: string;
  readonly identifier: string;
  readonly value: string;
  readonly relayHint: string | null;
}

export interface BuildNip71VideoEventInput {
  readonly kind?: Nip71VideoKind;
  readonly identifier?: string | null;
  readonly title: string;
  readonly content?: string;
  readonly variants: readonly Nip71VideoVariantInput[];
  readonly publishedAt?: number | null;
  readonly alt?: string | null;
  readonly duration?: string | number | null;
  readonly contentWarning?: string | true | null;
  readonly textTracks?: readonly Nip71TextTrackInput[];
  readonly segments?: readonly Nip71SegmentInput[];
  readonly participants?: readonly Nip71ParticipantInput[];
  readonly hashtags?: readonly string[];
  readonly references?: readonly string[];
  readonly origin?: Nip71OriginInput | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip71VideoEventSnapshot {
  readonly kind: Nip71VideoKind;
  readonly identifier: string | null;
  readonly title: string;
  readonly content: string;
  readonly variants: readonly Nip71VideoVariant[];
  readonly publishedAt: number | null;
  readonly alt: string | null;
  readonly duration: number | null;
  readonly contentWarning: { readonly reason: string | null } | null;
  readonly textTracks: readonly Nip71TextTrack[];
  readonly segments: readonly Nip71Segment[];
  readonly participants: readonly Nip71Participant[];
  readonly hashtags: readonly string[];
  readonly references: readonly string[];
  readonly origin: Nip71Origin | null;
  readonly mediaTypes: readonly string[];
  readonly hashes: readonly string[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

const VIDEO_KIND_SET = new Set<number>(NIP71_VIDEO_KINDS);
const ADDRESSABLE_KIND_SET = new Set<number>(NIP71_ADDRESSABLE_VIDEO_KINDS);
const STRUCTURED_TAGS = new Set([
  'd',
  'title',
  'published_at',
  'alt',
  NIP71_IMETA_TAG,
  'duration',
  'content-warning',
  'text-track',
  'segment',
  'origin',
  'p',
  't',
  'r'
]);
const IMETA_STRUCTURED_FIELDS = new Set([
  'url',
  'm',
  'dim',
  'x',
  'blurhash',
  'image',
  'fallback',
  'service',
  'bitrate',
  'duration'
]);

export function isNip71VideoKind(kind: number): kind is Nip71VideoKind {
  return VIDEO_KIND_SET.has(kind);
}

export function isNip71AddressableVideoKind(kind: number): kind is Nip71AddressableVideoKind {
  return ADDRESSABLE_KIND_SET.has(kind);
}

export function buildNip71VideoEvent(input: BuildNip71VideoEventInput): EventParameters {
  const kind = input.kind ?? NIP71_VIDEO_KIND;
  if (!isNip71VideoKind(kind)) {
    throw new Error(`Unsupported NIP-71 video kind: ${kind}`);
  }
  if (input.variants.length === 0) {
    throw new Error('NIP-71 video event requires at least one imeta variant');
  }

  const tags: string[][] = [];
  if (isNip71AddressableVideoKind(kind)) {
    tags.push(['d', normalizeNonEmpty(input.identifier ?? '', 'addressable video identifier')]);
  }
  tags.push(['title', normalizeNonEmpty(input.title, 'video title')]);
  if (input.publishedAt !== undefined && input.publishedAt !== null) {
    assertTimestamp(input.publishedAt, 'published_at');
    tags.push(['published_at', String(input.publishedAt)]);
  }
  appendOptionalTag(tags, 'alt', input.alt);
  tags.push(...input.variants.map(buildNip71VideoVariantTag));
  appendOptionalNumericTag(tags, 'duration', input.duration);
  if (input.contentWarning === true) {
    tags.push(['content-warning']);
  } else {
    appendOptionalTag(tags, 'content-warning', input.contentWarning);
  }
  tags.push(...(input.textTracks ?? []).map(buildNip71TextTrackTag));
  tags.push(...(input.segments ?? []).map(buildNip71SegmentTag));
  if (input.origin) tags.push(buildNip71OriginTag(input.origin));
  tags.push(...(input.participants ?? []).map(buildNip71ParticipantTag));
  tags.push(...(input.hashtags ?? []).map(buildNip71HashtagTag));
  tags.push(...(input.references ?? []).map(buildNip71ReferenceTag));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_TAGS.has(tag[0])));

  return {
    kind,
    content: input.content ?? '',
    tags
  };
}

export function buildNip71VideoVariantTag(input: Nip71VideoVariantInput): string[] {
  const entries = [
    formatImetaEntry('url', normalizeNonEmpty(input.url, 'video URL')),
    formatImetaEntry('m', normalizeNonEmpty(input.mediaType, 'media type'))
  ];
  appendOptionalImetaEntry(entries, 'dim', input.dimensions);
  appendOptionalImetaEntry(entries, 'x', input.hash);
  appendOptionalImetaEntry(entries, 'blurhash', input.blurhash);
  entries.push(
    ...(input.images ?? []).map((image) =>
      formatImetaEntry('image', normalizeNonEmpty(image, 'preview image URL'))
    )
  );
  entries.push(
    ...(input.fallbacks ?? []).map((fallback) =>
      formatImetaEntry('fallback', normalizeNonEmpty(fallback, 'fallback video URL'))
    )
  );
  appendOptionalImetaEntry(entries, 'service', input.service);
  appendOptionalNumericImetaEntry(entries, 'bitrate', input.bitrate);
  appendOptionalNumericImetaEntry(entries, 'duration', input.duration);
  entries.push(
    ...(input.fields ?? [])
      .map((field) => ({
        name: normalizeNonEmpty(field.name, 'imeta field name'),
        value: normalizeNonEmpty(field.value, 'imeta field value')
      }))
      .filter((field) => !IMETA_STRUCTURED_FIELDS.has(field.name))
      .map((field) => formatImetaEntry(field.name, field.value))
  );
  return [NIP71_IMETA_TAG, ...entries];
}

export function buildNip71TextTrackTag(input: Nip71TextTrackInput): string[] {
  const tag = ['text-track', normalizeNonEmpty(input.value, 'text track value')];
  appendOptionalTag(tag, input.trackType);
  appendOptionalTag(tag, input.language);
  tag.push(
    ...(input.relayHints ?? []).map((relay) => normalizeNonEmpty(relay, 'text track relay hint'))
  );
  return tag;
}

export function buildNip71SegmentTag(input: Nip71SegmentInput): string[] {
  const tag = [
    'segment',
    normalizeNonEmpty(input.start, 'segment start'),
    normalizeNonEmpty(input.end, 'segment end'),
    normalizeNonEmpty(input.title, 'segment title')
  ];
  appendOptionalTag(tag, input.thumbnailUrl);
  return tag;
}

export function buildNip71ParticipantTag(input: Nip71ParticipantInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'participant pubkey');
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['p', pubkey, relayHint] : ['p', pubkey];
}

export function buildNip71HashtagTag(hashtag: string): string[] {
  return ['t', normalizeNonEmpty(hashtag.replace(/^#/, ''), 'hashtag')];
}

export function buildNip71ReferenceTag(url: string): string[] {
  return ['r', normalizeNonEmpty(url, 'reference URL')];
}

export function buildNip71OriginTag(input: Nip71OriginInput): string[] {
  const tag = [
    'origin',
    normalizeNonEmpty(input.platform, 'origin platform'),
    normalizeNonEmpty(input.externalId, 'origin external id'),
    normalizeNonEmpty(input.originalUrl, 'origin original URL')
  ];
  appendOptionalTag(tag, input.metadata);
  return tag;
}

export function buildNip71AddressTag(input: Nip71AddressPointerInput): string[] {
  const value = `${input.kind}:${normalizeNonEmpty(input.pubkey, 'address pubkey')}:${normalizeNonEmpty(
    input.identifier,
    'address identifier'
  )}`;
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['a', value, relayHint] : ['a', value];
}

export function parseNip71VideoEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip71VideoEventSnapshot | null {
  if (!isNip71VideoKind(event.kind)) return null;
  const title = firstTagValue(event.tags, 'title');
  if (!title) return null;
  const identifier = firstTagValue(event.tags, 'd');
  if (isNip71AddressableVideoKind(event.kind) && !identifier) return null;
  const variants = event.tags.flatMap((tag) => {
    const variant = parseNip71VideoVariantTag(tag);
    return variant ? [variant] : [];
  });
  if (variants.length === 0) return null;
  const publishedAt = parseInteger(firstTagValue(event.tags, 'published_at'));
  if (publishedAt === undefined) return null;

  return {
    kind: event.kind,
    identifier,
    title,
    content: event.content,
    variants,
    publishedAt,
    alt: firstTagValue(event.tags, 'alt'),
    duration: parseFiniteNumber(firstTagValue(event.tags, 'duration')) ?? null,
    contentWarning: parseContentWarning(event.tags),
    textTracks: parseNip71TextTrackTags(event.tags),
    segments: parseNip71SegmentTags(event.tags),
    participants: parseNip71ParticipantTags(event.tags),
    hashtags: parseTagValues(event.tags, 't'),
    references: parseTagValues(event.tags, 'r'),
    origin: parseNip71OriginTag(event.tags.find((tag) => tag[0] === 'origin')),
    mediaTypes: unique(variants.map((variant) => variant.mediaType)),
    hashes: unique(variants.flatMap((variant) => (variant.hash ? [variant.hash] : []))),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip71VideoVariantTag(tag: readonly string[]): Nip71VideoVariant | null {
  if (tag[0] !== NIP71_IMETA_TAG) return null;
  const fields = tag.slice(1).flatMap((entry) => {
    const parsed = parseImetaEntry(entry);
    return parsed ? [parsed] : [];
  });
  const url = firstFieldValue(fields, 'url');
  const mediaType = firstFieldValue(fields, 'm');
  if (!url || !mediaType) return null;

  return {
    url,
    mediaType,
    dimensions: firstFieldValue(fields, 'dim'),
    hash: firstFieldValue(fields, 'x'),
    blurhash: firstFieldValue(fields, 'blurhash'),
    images: fields.filter((field) => field.name === 'image').map((field) => field.value),
    fallbacks: fields.filter((field) => field.name === 'fallback').map((field) => field.value),
    service: firstFieldValue(fields, 'service'),
    bitrate: parseFiniteNumber(firstFieldValue(fields, 'bitrate')) ?? null,
    duration: parseFiniteNumber(firstFieldValue(fields, 'duration')) ?? null,
    fields: fields.filter((field) => !IMETA_STRUCTURED_FIELDS.has(field.name)),
    tag: [...tag]
  };
}

export function parseNip71TextTrackTags(tags: readonly (readonly string[])[]): Nip71TextTrack[] {
  return tags.flatMap((tag) => {
    const value = tag[0] === 'text-track' ? tag[1]?.trim() : null;
    if (!value) return [];
    return [
      {
        value,
        trackType: tag[2]?.trim() || null,
        language: tag[3]?.trim() || null,
        relayHints: tag
          .slice(4)
          .map((relay) => relay.trim())
          .filter(Boolean)
      }
    ];
  });
}

export function parseNip71SegmentTags(tags: readonly (readonly string[])[]): Nip71Segment[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'segment') return [];
    const start = tag[1]?.trim();
    const end = tag[2]?.trim();
    const title = tag[3]?.trim();
    if (!start || !end || !title) return [];
    return [
      {
        start,
        end,
        title,
        thumbnailUrl: tag[4]?.trim() || null
      }
    ];
  });
}

export function parseNip71ParticipantTags(
  tags: readonly (readonly string[])[]
): Nip71Participant[] {
  return tags.flatMap((tag) => {
    const pubkey = tag[0] === 'p' ? tag[1]?.trim() : null;
    if (!pubkey) return [];
    return [
      {
        pubkey,
        relayHint: tag[2]?.trim() || null
      }
    ];
  });
}

export function parseNip71OriginTag(tag: readonly string[] | undefined): Nip71Origin | null {
  if (!tag || tag[0] !== 'origin') return null;
  const platform = tag[1]?.trim();
  const externalId = tag[2]?.trim();
  const originalUrl = tag[3]?.trim();
  if (!platform || !externalId || !originalUrl) return null;
  return {
    platform,
    externalId,
    originalUrl,
    metadata: tag[4]?.trim() || null
  };
}

export function parseNip71AddressTag(tag: readonly string[]): Nip71AddressPointer | null {
  if (tag[0] !== 'a') return null;
  const [kindText, pubkey, ...identifierParts] = (tag[1] ?? '').trim().split(':');
  const kind = Number(kindText);
  const identifier = identifierParts.join(':').trim();
  if (!isNip71AddressableVideoKind(kind) || !pubkey?.trim() || !identifier) return null;
  return {
    kind,
    pubkey: pubkey.trim(),
    identifier,
    value: `${kind}:${pubkey.trim()}:${identifier}`,
    relayHint: tag[2]?.trim() || null
  };
}

function parseContentWarning(
  tags: readonly (readonly string[])[]
): { readonly reason: string | null } | null {
  const tag = tags.find((candidate) => candidate[0] === 'content-warning');
  if (!tag) return null;
  return { reason: tag[1]?.trim() || null };
}

function parseImetaEntry(value: string): Nip71ImetaField | null {
  const index = value.search(/\s/);
  if (index <= 0) return null;
  const name = value.slice(0, index).trim();
  const fieldValue = value.slice(index + 1).trim();
  if (!name || !fieldValue) return null;
  return { name, value: fieldValue };
}

function firstFieldValue(fields: readonly Nip71ImetaField[], name: string): string | null {
  return fields.find((field) => field.name === name)?.value ?? null;
}

function appendOptionalTag(
  tags: string[][],
  tagName: string,
  value: string | true | null | undefined
): void;
function appendOptionalTag(tag: string[], value: string | null | undefined): void;
function appendOptionalTag(
  target: string[][] | string[],
  tagNameOrValue: string | true | null | undefined,
  maybeValue?: string | true | null
): void {
  if (Array.isArray(target[0])) {
    const tagName = tagNameOrValue;
    if (typeof tagName !== 'string') return;
    const normalized = maybeValue === true ? null : maybeValue?.trim();
    if (normalized) (target as string[][]).push([tagName, normalized]);
    return;
  }
  const normalized = typeof tagNameOrValue === 'string' ? tagNameOrValue.trim() : '';
  if (normalized) (target as string[]).push(normalized);
}

function appendOptionalNumericTag(
  tags: string[][],
  tagName: string,
  value: string | number | null | undefined
): void {
  const normalized = normalizeOptionalNumber(value, tagName);
  if (normalized) tags.push([tagName, normalized]);
}

function appendOptionalImetaEntry(
  entries: string[],
  name: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) entries.push(formatImetaEntry(name, normalized));
}

function appendOptionalNumericImetaEntry(
  entries: string[],
  name: string,
  value: string | number | null | undefined
): void {
  const normalized = normalizeOptionalNumber(value, name);
  if (normalized) entries.push(formatImetaEntry(name, normalized));
}

function normalizeOptionalNumber(
  value: string | number | null | undefined,
  label: string
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`NIP-71 ${label} must be a non-negative finite number`);
  }
  return normalized;
}

function formatImetaEntry(name: string, value: string): string {
  return `${name} ${value}`;
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

function parseInteger(value: string | null): number | null | undefined {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseFiniteNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-71 ${label} must be a non-negative safe integer`);
  }
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-71 ${label} must not be empty`);
  return normalized;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
