import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIP03_OPEN_TIMESTAMPS_KIND = 1040;
export const NIP03_EVENT_TAG = 'e';
export const NIP03_KIND_TAG = 'k';

export interface BuildNip03OpenTimestampsAttestationInput {
  readonly targetEventId: string;
  readonly targetKind: number;
  readonly relayUrl: string;
  readonly otsFileBase64: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip03OpenTimestampsAttestationSnapshot {
  readonly kind: typeof NIP03_OPEN_TIMESTAMPS_KIND;
  readonly targetEventId: string;
  readonly relayUrl: string | null;
  readonly targetKind: number | null;
  readonly otsFileBase64: string;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNip03OpenTimestampsAttestationFilterInput {
  readonly targetEventIds?: readonly string[];
  readonly targetKinds?: readonly number[];
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

const HEX_64 = /^[0-9a-f]{64}$/i;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const STRUCTURED_TAGS = new Set<string>([NIP03_EVENT_TAG, NIP03_KIND_TAG]);

export function buildNip03OpenTimestampsAttestationEvent(
  input: BuildNip03OpenTimestampsAttestationInput
): EventParameters {
  return {
    kind: NIP03_OPEN_TIMESTAMPS_KIND,
    content: normalizeBase64(input.otsFileBase64),
    tags: [
      [
        NIP03_EVENT_TAG,
        normalizeHex64(input.targetEventId, 'target event id'),
        normalizeRelayUrl(input.relayUrl)
      ],
      [NIP03_KIND_TAG, String(normalizeKind(input.targetKind))],
      ...copyTags(input.tags ?? []).filter((tag) => !STRUCTURED_TAGS.has(tag[0]))
    ]
  };
}

export function buildNip03OpenTimestampsAttestationFilter(
  input: BuildNip03OpenTimestampsAttestationFilterInput = {}
): Filter {
  const filter: Filter = { kinds: [NIP03_OPEN_TIMESTAMPS_KIND] };
  if (input.targetEventIds?.length) {
    filter['#e'] = input.targetEventIds.map((id) => normalizeHex64(id, 'target event id'));
  }
  if (input.targetKinds?.length) {
    filter['#k'] = input.targetKinds.map((kind) => String(normalizeKind(kind)));
  }
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

export function parseNip03OpenTimestampsAttestationEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip03OpenTimestampsAttestationSnapshot | null {
  if (event.kind !== NIP03_OPEN_TIMESTAMPS_KIND) return null;
  if (!isNip03OtsFileBase64(event.content)) return null;
  const target = parseNip03TargetEventTag(event.tags);
  if (!target) return null;
  return {
    kind: NIP03_OPEN_TIMESTAMPS_KIND,
    targetEventId: target.eventId,
    relayUrl: target.relayUrl,
    targetKind: parseNip03TargetKindTag(event.tags),
    otsFileBase64: event.content.trim(),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip03TargetEventTag(
  tags: readonly (readonly string[])[]
): { eventId: string; relayUrl: string | null } | null {
  const tag = tags.find((candidate) => candidate[0] === NIP03_EVENT_TAG);
  const eventId = tag?.[1]?.trim().toLowerCase();
  if (!eventId || !HEX_64.test(eventId)) return null;
  const relayUrl = tag?.[2]?.trim() || null;
  if (relayUrl !== null && !/^wss?:\/\//i.test(relayUrl)) return null;
  return {
    eventId,
    relayUrl
  };
}

export function parseNip03TargetKindTag(tags: readonly (readonly string[])[]): number | null {
  const value = tags.find((tag) => tag[0] === NIP03_KIND_TAG)?.[1]?.trim();
  if (!value) return null;
  const kind = Number(value);
  return Number.isSafeInteger(kind) && kind >= 0 ? kind : null;
}

export function isNip03OtsFileBase64(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length % 4 === 0 && BASE64_PATTERN.test(normalized);
}

function normalizeBase64(value: string): string {
  const normalized = value.trim();
  if (!isNip03OtsFileBase64(normalized)) {
    throw new Error('NIP-03 OTS file content must be base64');
  }
  return normalized;
}

function normalizeHex64(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HEX_64.test(normalized)) throw new Error(`NIP-03 ${label} must be 32-byte hex`);
  return normalized;
}

function normalizeRelayUrl(value: string): string {
  const normalized = value.trim();
  if (!/^wss?:\/\//i.test(normalized)) throw new Error('NIP-03 relay URL must use ws:// or wss://');
  return normalized;
}

function normalizeKind(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('NIP-03 target kind must be a non-negative safe integer');
  }
  return value;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-03 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-03 ${label} must be a positive safe integer`);
  }
  return value;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
