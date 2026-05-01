import type { Filter } from './relay-request.js';

export const NIP50_SEARCH_SUPPORTED_NIP = 50;
export const NIP50_SEARCH_FIELD = 'search';
export const NIP50_SEARCH_EXTENSION_KEYS = [
  'include',
  'domain',
  'language',
  'sentiment',
  'nsfw'
] as const;

export type Nip50SearchExtensionKey = (typeof NIP50_SEARCH_EXTENSION_KEYS)[number] | string;

export interface Nip50SearchExtensionInput {
  readonly key: Nip50SearchExtensionKey;
  readonly value: string;
}

export interface Nip50SearchExtension extends Nip50SearchExtensionInput {
  readonly known: boolean;
}

export interface Nip50SearchQueryParts {
  readonly raw: string;
  readonly terms: readonly string[];
  readonly extensions: readonly Nip50SearchExtension[];
}

export interface BuildNip50SearchQueryInput {
  readonly terms: string | readonly string[];
  readonly extensions?: readonly Nip50SearchExtensionInput[];
}

export interface BuildNip50SearchFilterInput {
  readonly query: string | BuildNip50SearchQueryInput;
  readonly filter?: Filter;
}

export interface Nip50SearchFilterSnapshot {
  readonly query: Nip50SearchQueryParts;
  readonly constraints: Filter;
}

const KNOWN_EXTENSION_KEYS = new Set<string>(NIP50_SEARCH_EXTENSION_KEYS);

export function buildNip50SearchQuery(input: BuildNip50SearchQueryInput): string {
  const terms = normalizeTerms(input.terms);
  const extensions = (input.extensions ?? []).map(formatExtension);
  return normalizeSearchQuery([...terms, ...extensions].join(' '));
}

export function buildNip50SearchFilter(input: BuildNip50SearchFilterInput): Filter {
  const query =
    typeof input.query === 'string'
      ? normalizeSearchQuery(input.query)
      : buildNip50SearchQuery(input.query);
  return {
    ...(input.filter ?? {}),
    [NIP50_SEARCH_FIELD]: query
  };
}

export function parseNip50SearchFilter(filter: Filter): Nip50SearchFilterSnapshot | null {
  const raw = filter[NIP50_SEARCH_FIELD];
  if (typeof raw !== 'string') return null;
  const query = parseNip50SearchQuery(raw);
  if (!query) return null;
  const constraints = Object.fromEntries(
    Object.entries(filter).filter(([key]) => key !== NIP50_SEARCH_FIELD)
  ) as Filter;
  return { query, constraints };
}

export function parseNip50SearchQuery(query: string): Nip50SearchQueryParts | null {
  const raw = normalizeOptionalSearchQuery(query);
  if (!raw) return null;

  const terms: string[] = [];
  const extensions: Nip50SearchExtension[] = [];
  for (const token of raw.split(/\s+/)) {
    const separator = token.indexOf(':');
    if (separator <= 0 || separator === token.length - 1) {
      terms.push(token);
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    extensions.push({
      key,
      value,
      known: KNOWN_EXTENSION_KEYS.has(key)
    });
  }

  return { raw, terms, extensions };
}

export function filterHasNip50Search(filter: Filter): boolean {
  return parseNip50SearchFilter(filter) !== null;
}

export function relaySupportsNip50Search(input: {
  readonly supportedNips: readonly number[];
}): boolean {
  return input.supportedNips.includes(NIP50_SEARCH_SUPPORTED_NIP);
}

function normalizeTerms(terms: string | readonly string[]): string[] {
  const values = Array.isArray(terms) ? terms : [terms];
  const normalized = values.map((term) => term.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error('NIP-50 search query must not be empty');
  }
  return normalized;
}

function normalizeSearchQuery(query: string): string {
  const normalized = normalizeOptionalSearchQuery(query);
  if (!normalized) throw new Error('NIP-50 search query must not be empty');
  return normalized;
}

function normalizeOptionalSearchQuery(query: string): string | null {
  const normalized = query.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function formatExtension(extension: Nip50SearchExtensionInput): string {
  const key = extension.key.trim();
  const value = extension.value.trim();
  if (!key || key.includes(':') || /\s/.test(key)) {
    throw new Error('NIP-50 search extension key must be a non-empty single token without colon');
  }
  if (!value || /\s/.test(value)) {
    throw new Error('NIP-50 search extension value must be a non-empty single token');
  }
  return `${key}:${value}`;
}
