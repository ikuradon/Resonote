import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP68_PICTURE_EVENT_KIND = 20;
export const NIP68_IMETA_TAG = 'imeta';
export const NIP68_ACCEPTED_MEDIA_TYPES = [
  'image/apng',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
] as const;

export type Nip68AcceptedMediaType = (typeof NIP68_ACCEPTED_MEDIA_TYPES)[number];

export interface Nip68AnnotatedUserInput {
  readonly pubkey: string;
  readonly x: string | number;
  readonly y: string | number;
}

export interface Nip68AnnotatedUser {
  readonly pubkey: string;
  readonly x: string;
  readonly y: string;
}

export interface Nip68ImetaFieldInput {
  readonly name: string;
  readonly value: string;
}

export interface Nip68ImetaField {
  readonly name: string;
  readonly value: string;
}

export interface Nip68ImageInput {
  readonly url: string;
  readonly mediaType: Nip68AcceptedMediaType;
  readonly blurhash?: string | null;
  readonly dimensions?: string | null;
  readonly alt?: string | null;
  readonly hash?: string | null;
  readonly fallbacks?: readonly string[];
  readonly annotatedUsers?: readonly Nip68AnnotatedUserInput[];
  readonly fields?: readonly Nip68ImetaFieldInput[];
}

export interface Nip68Image {
  readonly url: string;
  readonly mediaType: Nip68AcceptedMediaType;
  readonly blurhash: string | null;
  readonly dimensions: string | null;
  readonly alt: string | null;
  readonly hash: string | null;
  readonly fallbacks: readonly string[];
  readonly annotatedUsers: readonly Nip68AnnotatedUser[];
  readonly fields: readonly Nip68ImetaField[];
  readonly tag: readonly string[];
}

export interface Nip68TaggedPubkeyInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
}

export interface Nip68TaggedPubkey {
  readonly pubkey: string;
  readonly relayHint: string | null;
}

export interface Nip68LanguageInput {
  readonly code: string;
  readonly namespace?: string | null;
}

export interface Nip68Language {
  readonly code: string;
  readonly namespace: string | null;
}

export interface BuildNip68PictureEventInput {
  readonly title: string;
  readonly content?: string;
  readonly images: readonly Nip68ImageInput[];
  readonly contentWarning?: string | true | null;
  readonly taggedPubkeys?: readonly Nip68TaggedPubkeyInput[];
  readonly mediaTypes?: readonly Nip68AcceptedMediaType[];
  readonly hashes?: readonly string[];
  readonly hashtags?: readonly string[];
  readonly location?: string | null;
  readonly geohash?: string | null;
  readonly language?: Nip68LanguageInput | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip68PictureEventSnapshot {
  readonly kind: typeof NIP68_PICTURE_EVENT_KIND;
  readonly title: string;
  readonly content: string;
  readonly images: readonly Nip68Image[];
  readonly contentWarning: { readonly reason: string | null } | null;
  readonly taggedPubkeys: readonly Nip68TaggedPubkey[];
  readonly mediaTypes: readonly Nip68AcceptedMediaType[];
  readonly hashes: readonly string[];
  readonly hashtags: readonly string[];
  readonly location: string | null;
  readonly geohash: string | null;
  readonly language: Nip68Language | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

const ACCEPTED_MEDIA_TYPE_SET = new Set<string>(NIP68_ACCEPTED_MEDIA_TYPES);
const STRUCTURED_TAGS = new Set([
  'title',
  NIP68_IMETA_TAG,
  'content-warning',
  'p',
  'm',
  'x',
  't',
  'location',
  'g',
  'L',
  'l'
]);
const IMETA_STRUCTURED_FIELDS = new Set([
  'url',
  'm',
  'blurhash',
  'dim',
  'alt',
  'x',
  'fallback',
  'annotate-user'
]);

export function isNip68AcceptedMediaType(value: string): value is Nip68AcceptedMediaType {
  return ACCEPTED_MEDIA_TYPE_SET.has(value);
}

export function buildNip68PictureEvent(input: BuildNip68PictureEventInput): EventParameters {
  if (input.images.length === 0) {
    throw new Error('NIP-68 picture event requires at least one image');
  }

  const imageTags = input.images.map(buildNip68ImetaTag);
  const imageMediaTypes = input.images.map((image) => image.mediaType);
  const imageHashes = input.images.flatMap((image) => {
    const hash = image.hash?.trim();
    return hash ? [hash] : [];
  });
  const tags: string[][] = [['title', normalizeNonEmpty(input.title, 'title')], ...imageTags];

  if (input.contentWarning === true) {
    tags.push(['content-warning']);
  } else {
    appendOptionalTag(tags, 'content-warning', input.contentWarning);
  }
  tags.push(...(input.taggedPubkeys ?? []).map(buildNip68TaggedPubkeyTag));
  tags.push(
    ...unique([...imageMediaTypes, ...(input.mediaTypes ?? [])]).map((mediaType) => [
      'm',
      mediaType
    ])
  );
  tags.push(
    ...unique([...imageHashes, ...(input.hashes ?? [])]).map((hash) => [
      'x',
      normalizeNonEmpty(hash, 'image hash')
    ])
  );
  tags.push(...(input.hashtags ?? []).map(buildNip68HashtagTag));
  appendOptionalTag(tags, 'location', input.location);
  appendOptionalTag(tags, 'g', input.geohash);
  if (input.language) {
    const namespace = input.language.namespace?.trim() || 'ISO-639-1';
    tags.push(
      ['L', namespace],
      ['l', normalizeNonEmpty(input.language.code, 'language code'), namespace]
    );
  }
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_TAGS.has(tag[0])));

  return {
    kind: NIP68_PICTURE_EVENT_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip68ImetaTag(input: Nip68ImageInput): string[] {
  assertAcceptedMediaType(input.mediaType);
  const entries = [
    formatImetaEntry('url', normalizeNonEmpty(input.url, 'image URL')),
    formatImetaEntry('m', input.mediaType)
  ];
  appendOptionalImetaEntry(entries, 'blurhash', input.blurhash);
  appendOptionalImetaEntry(entries, 'dim', input.dimensions);
  appendOptionalImetaEntry(entries, 'alt', input.alt);
  appendOptionalImetaEntry(entries, 'x', input.hash);
  entries.push(
    ...(input.fallbacks ?? []).map((fallback) =>
      formatImetaEntry('fallback', normalizeNonEmpty(fallback, 'fallback URL'))
    )
  );
  entries.push(...(input.annotatedUsers ?? []).map(buildNip68AnnotatedUserEntry));
  entries.push(
    ...(input.fields ?? [])
      .map((field) => ({
        name: normalizeNonEmpty(field.name, 'imeta field name'),
        value: normalizeNonEmpty(field.value, 'imeta field value')
      }))
      .filter((field) => !IMETA_STRUCTURED_FIELDS.has(field.name))
      .map((field) => formatImetaEntry(field.name, field.value))
  );
  return [NIP68_IMETA_TAG, ...entries];
}

export function buildNip68AnnotatedUserEntry(input: Nip68AnnotatedUserInput): string {
  const pubkey = normalizeNonEmpty(input.pubkey, 'annotated pubkey');
  const x = normalizeCoordinate(input.x, 'annotation x');
  const y = normalizeCoordinate(input.y, 'annotation y');
  return formatImetaEntry('annotate-user', `${pubkey}:${x}:${y}`);
}

export function buildNip68TaggedPubkeyTag(input: Nip68TaggedPubkeyInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'tagged pubkey');
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['p', pubkey, relayHint] : ['p', pubkey];
}

export function buildNip68HashtagTag(hashtag: string): string[] {
  return ['t', normalizeNonEmpty(hashtag.replace(/^#/, ''), 'hashtag')];
}

export function parseNip68PictureEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip68PictureEventSnapshot | null {
  if (event.kind !== NIP68_PICTURE_EVENT_KIND) return null;
  const title = firstTagValue(event.tags, 'title');
  if (!title) return null;
  const images = event.tags.flatMap((tag) => {
    const image = parseNip68ImetaTag(tag);
    return image ? [image] : [];
  });
  if (images.length === 0) return null;

  return {
    kind: NIP68_PICTURE_EVENT_KIND,
    title,
    content: event.content,
    images,
    contentWarning: parseContentWarning(event.tags),
    taggedPubkeys: parseNip68TaggedPubkeyTags(event.tags),
    mediaTypes: unique([
      ...images.map((image) => image.mediaType),
      ...parseMediaTypeTags(event.tags)
    ]),
    hashes: unique([
      ...images.flatMap((image) => (image.hash ? [image.hash] : [])),
      ...parseTagValues(event.tags, 'x')
    ]),
    hashtags: parseTagValues(event.tags, 't'),
    location: firstTagValue(event.tags, 'location'),
    geohash: firstTagValue(event.tags, 'g'),
    language: parseLanguage(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip68ImetaTag(tag: readonly string[]): Nip68Image | null {
  if (tag[0] !== NIP68_IMETA_TAG) return null;
  const fields = tag.slice(1).flatMap((entry) => {
    const parsed = parseImetaEntry(entry);
    return parsed ? [parsed] : [];
  });
  const url = firstFieldValue(fields, 'url');
  const mediaType = firstFieldValue(fields, 'm');
  if (!url || !mediaType || !isNip68AcceptedMediaType(mediaType)) return null;
  const annotatedUsers = fields.flatMap((field) => {
    if (field.name !== 'annotate-user') return [];
    const annotatedUser = parseNip68AnnotatedUserEntry(field.value);
    return annotatedUser ? [annotatedUser] : [];
  });

  return {
    url,
    mediaType,
    blurhash: firstFieldValue(fields, 'blurhash'),
    dimensions: firstFieldValue(fields, 'dim'),
    alt: firstFieldValue(fields, 'alt'),
    hash: firstFieldValue(fields, 'x'),
    fallbacks: fields.filter((field) => field.name === 'fallback').map((field) => field.value),
    annotatedUsers,
    fields: fields.filter((field) => !IMETA_STRUCTURED_FIELDS.has(field.name)),
    tag: [...tag]
  };
}

export function parseNip68AnnotatedUserEntry(value: string): Nip68AnnotatedUser | null {
  const [pubkey, x, y, ...extra] = value.split(':');
  if (extra.length > 0 || !pubkey?.trim() || !x?.trim() || !y?.trim()) return null;
  return {
    pubkey: pubkey.trim(),
    x: x.trim(),
    y: y.trim()
  };
}

export function parseNip68TaggedPubkeyTags(
  tags: readonly (readonly string[])[]
): Nip68TaggedPubkey[] {
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

function parseContentWarning(
  tags: readonly (readonly string[])[]
): { readonly reason: string | null } | null {
  const tag = tags.find((candidate) => candidate[0] === 'content-warning');
  if (!tag) return null;
  return { reason: tag[1]?.trim() || null };
}

function parseMediaTypeTags(tags: readonly (readonly string[])[]): Nip68AcceptedMediaType[] {
  return unique(
    tags.flatMap((tag) => {
      const mediaType = tag[0] === 'm' ? tag[1]?.trim() : null;
      return mediaType && isNip68AcceptedMediaType(mediaType) ? [mediaType] : [];
    })
  );
}

function parseLanguage(tags: readonly (readonly string[])[]): Nip68Language | null {
  const namespace = firstTagValue(tags, 'L');
  const languageTag = tags.find((tag) => tag[0] === 'l' && Boolean(tag[1]?.trim()));
  if (!languageTag) return null;
  return {
    code: languageTag[1].trim(),
    namespace: languageTag[2]?.trim() || namespace
  };
}

function parseImetaEntry(value: string): Nip68ImetaField | null {
  const index = value.search(/\s/);
  if (index <= 0) return null;
  const name = value.slice(0, index).trim();
  const fieldValue = value.slice(index + 1).trim();
  if (!name || !fieldValue) return null;
  return { name, value: fieldValue };
}

function firstFieldValue(fields: readonly Nip68ImetaField[], name: string): string | null {
  return fields.find((field) => field.name === name)?.value ?? null;
}

function appendOptionalTag(
  tags: string[][],
  tagName: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
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

function assertAcceptedMediaType(value: string): asserts value is Nip68AcceptedMediaType {
  if (!isNip68AcceptedMediaType(value)) {
    throw new Error(`NIP-68 unsupported image media type: ${value}`);
  }
}

function normalizeCoordinate(value: string | number, label: string): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`NIP-68 ${label} must be finite`);
  }
  return normalizeNonEmpty(String(value), label);
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-68 ${label} must not be empty`);
  return normalized;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
