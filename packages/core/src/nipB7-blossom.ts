import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIPB7_BLOSSOM_SERVER_LIST_KIND = 10063;
export const NIPB7_SERVER_TAG = 'server';

export interface BuildNipB7BlossomServerListInput {
  readonly servers: readonly string[];
  readonly tags?: readonly (readonly string[])[];
}

export interface NipB7BlossomServerListSnapshot {
  readonly kind: typeof NIPB7_BLOSSOM_SERVER_LIST_KIND;
  readonly servers: readonly string[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNipB7BlossomServerListFilterInput {
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

export interface NipB7BlossomHashFromUrl {
  readonly hash: string;
  readonly extension: string | null;
}

export type NipB7BlossomContent = ArrayBuffer | Uint8Array;

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const HASH_WITH_EXTENSION = /^([0-9a-f]{64})(\.[A-Za-z0-9][A-Za-z0-9._-]*)?$/i;

export function buildNipB7BlossomServerListEvent(
  input: BuildNipB7BlossomServerListInput
): EventParameters {
  const servers = normalizeServerList(input.servers);
  return {
    kind: NIPB7_BLOSSOM_SERVER_LIST_KIND,
    content: '',
    tags: [
      ...servers.map(buildNipB7BlossomServerTag),
      ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== NIPB7_SERVER_TAG)
    ]
  };
}

export function buildNipB7BlossomServerTag(serverUrl: string): string[] {
  return [NIPB7_SERVER_TAG, normalizeBlossomServerUrl(serverUrl)];
}

export function buildNipB7BlossomServerListFilter(
  input: BuildNipB7BlossomServerListFilterInput = {}
): Filter {
  const filter: Filter = { kinds: [NIPB7_BLOSSOM_SERVER_LIST_KIND] };
  if (input.authors?.length) {
    filter.authors = input.authors.map((author) => normalizeHex64(author, 'author pubkey'));
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

export function parseNipB7BlossomServerListEvent(
  event: Pick<NostrEvent, 'kind' | 'tags'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): NipB7BlossomServerListSnapshot | null {
  if (event.kind !== NIPB7_BLOSSOM_SERVER_LIST_KIND) return null;
  const servers = parseNipB7BlossomServerTags(event.tags);
  if (servers.length === 0) return null;
  return {
    kind: NIPB7_BLOSSOM_SERVER_LIST_KIND,
    servers,
    customTags: copyTags(event.tags).filter((tag) => tag[0] !== NIPB7_SERVER_TAG),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNipB7BlossomServerTags(tags: readonly (readonly string[])[]): string[] {
  return [
    ...new Set(
      tags.flatMap((tag) => {
        if (tag[0] !== NIPB7_SERVER_TAG) return [];
        try {
          return [normalizeBlossomServerUrl(tag[1] ?? '')];
        } catch {
          return [];
        }
      })
    )
  ];
}

export function extractNipB7BlossomHashFromUrl(url: string): NipB7BlossomHashFromUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let segment: string;
  try {
    segment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '');
  } catch {
    return null;
  }
  const match = segment.match(HASH_WITH_EXTENSION);
  if (!match) return null;
  return {
    hash: match[1].toLowerCase(),
    extension: match[2] ?? null
  };
}

export function buildNipB7BlossomFileUrl(
  serverUrl: string,
  hash: string,
  extension?: string | null
): string {
  const normalizedHash = normalizeSha256(hash, 'file hash');
  const normalizedExtension = normalizeOptionalExtension(extension);
  return `${normalizeBlossomServerUrl(serverUrl)}/${normalizedHash}${normalizedExtension}`;
}

export function buildNipB7BlossomFallbackUrls(
  originalUrl: string,
  servers: readonly string[]
): string[] {
  const extracted = extractNipB7BlossomHashFromUrl(originalUrl);
  if (!extracted) return [];
  const normalizedServers = [...new Set(servers.map(normalizeBlossomServerUrl))];
  return [
    ...new Set(
      normalizedServers.map((server) =>
        buildNipB7BlossomFileUrl(server, extracted.hash, extracted.extension)
      )
    )
  ];
}

export function calculateNipB7BlossomContentHash(content: NipB7BlossomContent): string {
  return bytesToHex(sha256(toUint8Array(content)));
}

export function verifyNipB7BlossomContentHash(
  content: NipB7BlossomContent,
  expectedHash: string
): boolean {
  return (
    calculateNipB7BlossomContentHash(content) === normalizeSha256(expectedHash, 'expected hash')
  );
}

function normalizeServerList(servers: readonly string[]): string[] {
  const normalized = [...new Set(servers.map(normalizeBlossomServerUrl))];
  if (normalized.length === 0)
    throw new Error('NIP-B7 server list must include at least one server');
  return normalized;
}

function normalizeBlossomServerUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('NIP-B7 server URL must be absolute');
  }
  if (parsed.protocol !== 'https:') throw new Error('NIP-B7 server URL must use https');
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeSha256(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_HEX.test(normalized)) throw new Error(`NIP-B7 ${label} must be SHA-256 hex`);
  return normalized;
}

function normalizeHex64(value: string, label: string): string {
  return normalizeSha256(value, label);
}

function normalizeOptionalExtension(value: string | null | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  const normalized = value.startsWith('.') ? value : `.${value}`;
  if (!/^\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error('NIP-B7 file extension is invalid');
  }
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-B7 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-B7 ${label} must be a positive safe integer`);
  }
  return value;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function toUint8Array(content: NipB7BlossomContent): Uint8Array {
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}
