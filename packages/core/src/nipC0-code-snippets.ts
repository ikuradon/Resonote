import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIPC0_CODE_SNIPPET_KIND = 1337;
export const NIPC0_LANGUAGE_TAG = 'l';
export const NIPC0_METADATA_TAGS = [
  NIPC0_LANGUAGE_TAG,
  'name',
  'extension',
  'description',
  'runtime',
  'license',
  'dep',
  'repo'
] as const;

export type NipC0CodeSnippetMetadataTag = (typeof NIPC0_METADATA_TAGS)[number];

export interface BuildNipC0CodeSnippetInput {
  readonly code: string;
  readonly language?: string | null;
  readonly name?: string | null;
  readonly extension?: string | null;
  readonly description?: string | null;
  readonly runtime?: string | null;
  readonly license?: string | null;
  readonly dependencies?: readonly string[];
  readonly repo?: string | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface NipC0CodeSnippetSnapshot {
  readonly kind: typeof NIPC0_CODE_SNIPPET_KIND;
  readonly code: string;
  readonly language: string | null;
  readonly name: string | null;
  readonly extension: string | null;
  readonly description: string | null;
  readonly runtime: string | null;
  readonly license: string | null;
  readonly dependencies: readonly string[];
  readonly repo: string | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNipC0CodeSnippetFilterInput {
  readonly languages?: readonly string[];
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

const STRUCTURED_TAGS = new Set<string>(NIPC0_METADATA_TAGS);

export function isNipC0CodeSnippetKind(kind: number): kind is typeof NIPC0_CODE_SNIPPET_KIND {
  return kind === NIPC0_CODE_SNIPPET_KIND;
}

export function buildNipC0CodeSnippet(input: BuildNipC0CodeSnippetInput): EventParameters {
  return {
    kind: NIPC0_CODE_SNIPPET_KIND,
    content: normalizeCode(input.code),
    tags: [
      ...optionalTag(buildNipC0LanguageTag, input.language),
      ...optionalTag(buildNipC0NameTag, input.name),
      ...optionalTag(buildNipC0ExtensionTag, input.extension),
      ...optionalTag(buildNipC0DescriptionTag, input.description),
      ...optionalTag(buildNipC0RuntimeTag, input.runtime),
      ...optionalTag(buildNipC0LicenseTag, input.license),
      ...(input.dependencies ?? []).map(buildNipC0DependencyTag),
      ...optionalTag(buildNipC0RepoTag, input.repo),
      ...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_TAGS.has(tag[0]))
    ]
  };
}

export function buildNipC0LanguageTag(language: string): string[] {
  return [NIPC0_LANGUAGE_TAG, normalizeLowercaseValue(language, 'language')];
}

export function buildNipC0NameTag(name: string): string[] {
  return ['name', normalizeNonEmpty(name, 'name')];
}

export function buildNipC0ExtensionTag(extension: string): string[] {
  return ['extension', normalizeExtension(extension)];
}

export function buildNipC0DescriptionTag(description: string): string[] {
  return ['description', normalizeNonEmpty(description, 'description')];
}

export function buildNipC0RuntimeTag(runtime: string): string[] {
  return ['runtime', normalizeNonEmpty(runtime, 'runtime')];
}

export function buildNipC0LicenseTag(license: string): string[] {
  return ['license', normalizeNonEmpty(license, 'license')];
}

export function buildNipC0DependencyTag(dependency: string): string[] {
  return ['dep', normalizeNonEmpty(dependency, 'dependency')];
}

export function buildNipC0RepoTag(repo: string): string[] {
  return ['repo', normalizeNonEmpty(repo, 'repo')];
}

export function buildNipC0CodeSnippetFilter(input: BuildNipC0CodeSnippetFilterInput = {}): Filter {
  const filter: Filter = { kinds: [NIPC0_CODE_SNIPPET_KIND] };
  if (input.languages?.length) {
    filter['#l'] = input.languages.map((language) => normalizeLowercaseValue(language, 'language'));
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

export function parseNipC0CodeSnippet(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): NipC0CodeSnippetSnapshot | null {
  if (!isNipC0CodeSnippetKind(event.kind)) return null;
  if (!event.content.trim()) return null;
  return {
    kind: NIPC0_CODE_SNIPPET_KIND,
    code: event.content,
    language: firstTagValue(event.tags, NIPC0_LANGUAGE_TAG),
    name: firstTagValue(event.tags, 'name'),
    extension: firstTagValue(event.tags, 'extension'),
    description: firstTagValue(event.tags, 'description'),
    runtime: firstTagValue(event.tags, 'runtime'),
    license: firstTagValue(event.tags, 'license'),
    dependencies: tagValues(event.tags, 'dep'),
    repo: firstTagValue(event.tags, 'repo'),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

function optionalTag(
  build: (value: string) => string[],
  value: string | null | undefined
): string[][] {
  const normalized = value?.trim();
  return normalized ? [build(normalized)] : [];
}

function normalizeCode(code: string): string {
  if (!code.trim()) throw new Error('NIP-C0 code content must be non-empty');
  return code;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-C0 ${label} must be non-empty`);
  return normalized;
}

function normalizeLowercaseValue(value: string, label: string): string {
  return normalizeNonEmpty(value, label).toLowerCase();
}

function normalizeExtension(extension: string): string {
  const normalized = normalizeNonEmpty(extension, 'extension').replace(/^\.+/, '').toLowerCase();
  if (!normalized) throw new Error('NIP-C0 extension must omit the dot and be non-empty');
  return normalized;
}

function firstTagValue(
  tags: readonly (readonly string[])[],
  tagName: NipC0CodeSnippetMetadataTag
): string | null {
  return tags.find((tag) => tag[0] === tagName)?.[1]?.trim() || null;
}

function tagValues(
  tags: readonly (readonly string[])[],
  tagName: NipC0CodeSnippetMetadataTag
): string[] {
  return tags
    .filter((tag) => tag[0] === tagName)
    .map((tag) => tag[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-C0 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-C0 ${label} must be a positive safe integer`);
  }
  return value;
}
