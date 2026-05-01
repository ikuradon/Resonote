import type { Event as NostrEvent } from 'nostr-typedef';

export const NIP92_IMETA_TAG = 'imeta';
export const NIP92_NIP94_FILE_FIELDS = [
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

export type Nip92KnownFileField = (typeof NIP92_NIP94_FILE_FIELDS)[number];

export interface Nip92ImetaFieldInput {
  readonly name: string;
  readonly value: string;
}

export interface Nip92ImetaField {
  readonly name: string;
  readonly value: string;
}

export interface Nip92PreviewResourceInput {
  readonly url: string;
  readonly hash?: string | null;
}

export interface Nip92PreviewResource {
  readonly url: string;
  readonly hash: string | null;
  readonly value: string;
}

export interface Nip92Dimensions {
  readonly width: number;
  readonly height: number;
}

export interface Nip92MediaAttachmentInput {
  readonly url: string;
  readonly mediaType?: string | null;
  readonly hash?: string | null;
  readonly originalHash?: string | null;
  readonly size?: string | number | null;
  readonly dimensions?: string | null;
  readonly magnet?: string | null;
  readonly torrentInfoHash?: string | null;
  readonly blurhash?: string | null;
  readonly thumb?: string | Nip92PreviewResourceInput | null;
  readonly image?: string | Nip92PreviewResourceInput | null;
  readonly summary?: string | null;
  readonly alt?: string | null;
  readonly fallbacks?: readonly string[];
  readonly service?: string | null;
  readonly fields?: readonly Nip92ImetaFieldInput[];
}

export interface Nip92MediaAttachment {
  readonly url: string;
  readonly mediaType: string | null;
  readonly hash: string | null;
  readonly originalHash: string | null;
  readonly size: number | null;
  readonly sizeText: string | null;
  readonly dimensions: string | null;
  readonly parsedDimensions: Nip92Dimensions | null;
  readonly magnet: string | null;
  readonly torrentInfoHash: string | null;
  readonly blurhash: string | null;
  readonly thumb: Nip92PreviewResource | null;
  readonly image: Nip92PreviewResource | null;
  readonly summary: string | null;
  readonly alt: string | null;
  readonly fallbacks: readonly string[];
  readonly service: string | null;
  readonly fields: readonly Nip92ImetaField[];
  readonly tag: readonly string[];
}

export interface WithNip92MediaAttachmentsInput {
  readonly content: string;
  readonly attachments: readonly Nip92MediaAttachmentInput[];
  readonly tags?: readonly (readonly string[])[];
  readonly requireContentMatch?: boolean;
}

export interface Nip92ParseMediaAttachmentsOptions {
  readonly requireContentMatch?: boolean;
  readonly uniqueByUrl?: boolean;
}

const STRUCTURED_FIELDS = new Set<string>(['url', ...NIP92_NIP94_FILE_FIELDS]);
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const DIMENSIONS_PATTERN = /^([1-9]\d*)x([1-9]\d*)$/;

export function buildNip92ImetaTag(input: Nip92MediaAttachmentInput): string[] {
  const entries = [formatImetaEntry('url', normalizeNonEmpty(input.url, 'attachment URL'))];
  appendOptionalImetaEntry(entries, 'm', normalizeOptionalMediaType(input.mediaType));
  appendOptionalImetaEntry(entries, 'x', normalizeOptionalSha256(input.hash, 'file hash'));
  appendOptionalImetaEntry(
    entries,
    'ox',
    normalizeOptionalSha256(input.originalHash, 'original file hash')
  );
  appendOptionalImetaEntry(entries, 'size', normalizeOptionalSize(input.size));
  appendOptionalImetaEntry(entries, 'dim', normalizeOptionalDimensions(input.dimensions));
  appendOptionalImetaEntry(entries, 'magnet', input.magnet);
  appendOptionalImetaEntry(entries, 'i', input.torrentInfoHash);
  appendOptionalImetaEntry(entries, 'blurhash', input.blurhash);
  appendOptionalImetaEntry(entries, 'thumb', normalizeOptionalPreviewResource(input.thumb));
  appendOptionalImetaEntry(entries, 'image', normalizeOptionalPreviewResource(input.image));
  appendOptionalImetaEntry(entries, 'summary', input.summary);
  appendOptionalImetaEntry(entries, 'alt', input.alt);
  entries.push(
    ...(input.fallbacks ?? []).map((fallback) =>
      formatImetaEntry('fallback', normalizeNonEmpty(fallback, 'fallback URL'))
    )
  );
  appendOptionalImetaEntry(entries, 'service', input.service);
  entries.push(
    ...(input.fields ?? [])
      .map((field) => ({
        name: normalizeNonEmpty(field.name, 'imeta field name'),
        value: normalizeNonEmpty(field.value, 'imeta field value')
      }))
      .filter((field) => !STRUCTURED_FIELDS.has(field.name))
      .map((field) => formatImetaEntry(field.name, field.value))
  );

  if (entries.length < 2) {
    throw new Error('NIP-92 imeta tag requires a url and at least one metadata field');
  }
  return [NIP92_IMETA_TAG, ...entries];
}

export function buildNip92MediaAttachmentTags(
  attachments: readonly Nip92MediaAttachmentInput[]
): string[][] {
  return attachments.map(buildNip92ImetaTag);
}

export function withNip92MediaAttachments(input: WithNip92MediaAttachmentsInput): {
  readonly content: string;
  readonly tags: string[][];
} {
  const attachmentTags = buildNip92MediaAttachmentTags(input.attachments);
  if (input.requireContentMatch ?? true) {
    for (const tag of attachmentTags) {
      const attachment = parseNip92ImetaTag(tag);
      if (attachment && !isNip92MediaAttachmentUrlReferenced(input.content, attachment)) {
        throw new Error(`NIP-92 attachment URL is not present in content: ${attachment.url}`);
      }
    }
  }
  return {
    content: input.content,
    tags: [...copyTags(input.tags ?? []), ...attachmentTags]
  };
}

export function parseNip92MediaAttachments(
  event: Pick<NostrEvent, 'tags' | 'content'>,
  options: Nip92ParseMediaAttachmentsOptions = {}
): Nip92MediaAttachment[] {
  const attachments = event.tags.flatMap((tag) => {
    const attachment = parseNip92ImetaTag(tag);
    return attachment ? [attachment] : [];
  });
  const contentMatched = options.requireContentMatch
    ? filterNip92ReferencedMediaAttachments(event.content, attachments)
    : attachments;
  return options.uniqueByUrl ? dedupeNip92MediaAttachmentsByUrl(contentMatched) : contentMatched;
}

export function hasNip92MediaAttachments(
  event: Pick<NostrEvent, 'tags' | 'content'>,
  options: Nip92ParseMediaAttachmentsOptions = {}
): boolean {
  return parseNip92MediaAttachments(event, options).length > 0;
}

export function parseNip92ImetaTag(tag: readonly string[]): Nip92MediaAttachment | null {
  if (tag[0] !== NIP92_IMETA_TAG) return null;
  const fields = tag.slice(1).flatMap((entry) => {
    const parsed = parseNip92ImetaEntry(entry);
    return parsed ? [parsed] : [];
  });
  const url = firstFieldValue(fields, 'url');
  if (!url || !fields.some((field) => field.name !== 'url')) return null;

  const sizeText = firstFieldValue(fields, 'size');
  const dimensions = firstFieldValue(fields, 'dim');
  return {
    url,
    mediaType: firstFieldValue(fields, 'm'),
    hash: parseOptionalSha256(firstFieldValue(fields, 'x')),
    originalHash: parseOptionalSha256(firstFieldValue(fields, 'ox')),
    size: parseNonNegativeInteger(sizeText),
    sizeText,
    dimensions,
    parsedDimensions: parseNip92Dimensions(dimensions),
    magnet: firstFieldValue(fields, 'magnet'),
    torrentInfoHash: firstFieldValue(fields, 'i'),
    blurhash: firstFieldValue(fields, 'blurhash'),
    thumb: parsePreviewResource(firstFieldValue(fields, 'thumb')),
    image: parsePreviewResource(firstFieldValue(fields, 'image')),
    summary: firstFieldValue(fields, 'summary'),
    alt: firstFieldValue(fields, 'alt'),
    fallbacks: fields.filter((field) => field.name === 'fallback').map((field) => field.value),
    service: firstFieldValue(fields, 'service'),
    fields: fields.filter((field) => !STRUCTURED_FIELDS.has(field.name)),
    tag: [...tag]
  };
}

export function parseNip92ImetaEntry(value: string): Nip92ImetaField | null {
  const index = value.search(/\s/);
  if (index <= 0) return null;
  const name = value.slice(0, index).trim();
  const fieldValue = value.slice(index + 1).trim();
  if (!name || !fieldValue) return null;
  return { name, value: fieldValue };
}

export function parseNip92Dimensions(value: string | null | undefined): Nip92Dimensions | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const match = DIMENSIONS_PATTERN.exec(normalized);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

export function isNip92MediaAttachmentUrlReferenced(
  content: string,
  attachmentOrUrl: Nip92MediaAttachment | string
): boolean {
  const url = typeof attachmentOrUrl === 'string' ? attachmentOrUrl : attachmentOrUrl.url;
  return url.length > 0 && content.includes(url);
}

export function filterNip92ReferencedMediaAttachments(
  content: string,
  attachments: readonly Nip92MediaAttachment[]
): Nip92MediaAttachment[] {
  return attachments.filter((attachment) =>
    isNip92MediaAttachmentUrlReferenced(content, attachment)
  );
}

export function dedupeNip92MediaAttachmentsByUrl(
  attachments: readonly Nip92MediaAttachment[]
): Nip92MediaAttachment[] {
  const seen = new Set<string>();
  const deduped: Nip92MediaAttachment[] = [];
  for (const attachment of attachments) {
    if (seen.has(attachment.url)) continue;
    seen.add(attachment.url);
    deduped.push(attachment);
  }
  return deduped;
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

function firstFieldValue(fields: readonly Nip92ImetaField[], name: string): string | null {
  return fields.find((field) => field.name === name)?.value ?? null;
}

function normalizeOptionalMediaType(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeOptionalSha256(value: string | null | undefined, label: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!SHA256_HEX_PATTERN.test(normalized)) {
    throw new Error(`NIP-92 ${label} must be SHA-256 hex`);
  }
  return normalized.toLowerCase();
}

function normalizeOptionalSize(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    throw new Error('NIP-92 file size must be a non-negative safe integer');
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('NIP-92 file size must be a non-negative safe integer');
  }
  return String(parsed);
}

function normalizeOptionalDimensions(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!DIMENSIONS_PATTERN.test(normalized)) {
    throw new Error('NIP-92 dimensions must use <width>x<height>');
  }
  return normalized;
}

function normalizeOptionalPreviewResource(
  value: string | Nip92PreviewResourceInput | null | undefined
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return normalizeNonEmpty(value, 'preview resource URL');
  const url = normalizeNonEmpty(value.url, 'preview resource URL');
  const hash = normalizeOptionalSha256(value.hash, 'preview resource hash');
  return hash ? `${url} ${hash}` : url;
}

function parsePreviewResource(value: string | null): Nip92PreviewResource | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const [url, hashCandidate] = normalized.split(/\s+/, 2);
  if (!url) return null;
  return {
    url,
    hash: parseOptionalSha256(hashCandidate ?? null),
    value: normalized
  };
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
  if (!normalized) throw new Error(`NIP-92 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
