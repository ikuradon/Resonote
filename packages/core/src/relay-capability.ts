import type { Event as NostrEvent } from 'nostr-typedef';

export type RelayCapabilitySource = 'unknown' | 'nip11' | 'learned' | 'mixed' | 'override';
export type RelayCapabilityNip11Status = 'unknown' | 'ok' | 'failed';

export const NIP66_RELAY_DISCOVERY_KIND = 30166;
export const NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND = 10166;

export interface RelayCapabilityRecord {
  readonly relayUrl: string;
  readonly nip11Status: RelayCapabilityNip11Status;
  readonly nip11CheckedAt: number | null;
  readonly nip11ExpiresAt: number | null;
  readonly supportedNips: readonly number[];
  readonly nip11MaxFilters: number | null;
  readonly nip11MaxSubscriptions: number | null;
  readonly learnedMaxFilters: number | null;
  readonly learnedMaxSubscriptions: number | null;
  readonly learnedAt: number | null;
  readonly learnedReason: string | null;
  readonly updatedAt: number;
}

export interface RelayCapabilityOverride {
  readonly maxFilters?: number | null;
  readonly maxSubscriptions?: number | null;
}

export interface RelayExecutionCapability {
  readonly relayUrl: string;
  readonly maxFilters: number | null;
  readonly maxSubscriptions: number | null;
  readonly supportedNips: readonly number[];
  readonly source: RelayCapabilitySource;
  readonly expiresAt: number | null;
  readonly stale: boolean;
}

export interface RelayCapabilityLearningEvent {
  readonly relayUrl: string;
  readonly kind: 'maxFilters' | 'maxSubscriptions';
  readonly value: number;
  readonly reason: string;
}

export interface Nip66RelayDiscovery {
  readonly relayUrl: string;
  readonly monitorPubkey: string;
  readonly createdAt: number;
  readonly supportedNips: readonly number[];
  readonly requirements: readonly string[];
  readonly networkTypes: readonly string[];
  readonly relayTypes: readonly string[];
  readonly topics: readonly string[];
  readonly geohashes: readonly string[];
  readonly rttOpenMs: number | null;
  readonly rttReadMs: number | null;
  readonly rttWriteMs: number | null;
}

export interface Nip66RelayMonitorTimeout {
  readonly check: string;
  readonly timeoutMs: number;
}

export interface Nip66RelayMonitorAnnouncement {
  readonly monitorPubkey: string;
  readonly createdAt: number;
  readonly frequencySeconds: number | null;
  readonly checks: readonly string[];
  readonly timeouts: readonly Nip66RelayMonitorTimeout[];
  readonly geohashes: readonly string[];
}

export function calculateEffectiveRelayCapability(
  record: RelayCapabilityRecord | null,
  now: number,
  override: RelayCapabilityOverride = {},
  fallbackRelayUrl = ''
): RelayExecutionCapability {
  const relayUrl = record?.relayUrl ?? fallbackRelayUrl;
  const nip11Fresh =
    record?.nip11Status === 'ok' &&
    typeof record.nip11ExpiresAt === 'number' &&
    record.nip11ExpiresAt > now;
  const stale = Boolean(record?.nip11ExpiresAt && record.nip11ExpiresAt <= now);

  const maxFilters = minNullable(
    nip11Fresh ? record.nip11MaxFilters : null,
    record?.learnedMaxFilters ?? null,
    normalizePositiveInteger(override.maxFilters ?? null)
  );
  const maxSubscriptions = minNullable(
    nip11Fresh ? record.nip11MaxSubscriptions : null,
    record?.learnedMaxSubscriptions ?? null,
    normalizePositiveInteger(override.maxSubscriptions ?? null)
  );
  const source = resolveSource({
    hasFreshNip11:
      nip11Fresh &&
      (record.nip11MaxFilters !== null ||
        record.nip11MaxSubscriptions !== null ||
        record.supportedNips.length > 0),
    hasLearned: Boolean(record?.learnedMaxFilters ?? record?.learnedMaxSubscriptions),
    hasOverride: override.maxFilters != null || override.maxSubscriptions != null
  });

  return {
    relayUrl,
    maxFilters,
    maxSubscriptions,
    supportedNips: nip11Fresh ? [...(record?.supportedNips ?? [])] : [],
    source,
    expiresAt: record?.nip11ExpiresAt ?? null,
    stale
  };
}

export function parseRelayLimitClosedReason(input: {
  readonly relayUrl: string;
  readonly reason: string;
  readonly activeAcceptedSubscriptions: number;
}): RelayCapabilityLearningEvent | null {
  const reason = input.reason.trim();
  const lower = reason.toLowerCase();
  if (!lower) return null;

  if (lower.includes('filter')) {
    return {
      relayUrl: input.relayUrl,
      kind: 'maxFilters',
      value: extractFirstPositiveInteger(reason) ?? 1,
      reason
    };
  }

  if (lower.includes('subscription') || lower.includes('too many subs')) {
    return {
      relayUrl: input.relayUrl,
      kind: 'maxSubscriptions',
      value: extractFirstPositiveInteger(reason) ?? Math.max(1, input.activeAcceptedSubscriptions),
      reason
    };
  }

  return null;
}

export function parseNip66RelayDiscoveryEvent(
  event: Pick<NostrEvent, 'kind' | 'pubkey' | 'created_at' | 'tags'>
): Nip66RelayDiscovery | null {
  if (event.kind !== NIP66_RELAY_DISCOVERY_KIND) return null;
  const relayUrl = findFirstTagValue(event.tags, 'd')?.trim();
  if (!relayUrl) return null;

  return {
    relayUrl,
    monitorPubkey: event.pubkey,
    createdAt: event.created_at,
    supportedNips: parseUniqueIntegers(event.tags, 'N'),
    requirements: findTagValues(event.tags, 'R'),
    networkTypes: findTagValues(event.tags, 'n'),
    relayTypes: findTagValues(event.tags, 'T'),
    topics: findTagValues(event.tags, 't'),
    geohashes: findTagValues(event.tags, 'g'),
    rttOpenMs: parseFirstNonNegativeIntegerTag(event.tags, 'rtt-open'),
    rttReadMs: parseFirstNonNegativeIntegerTag(event.tags, 'rtt-read'),
    rttWriteMs: parseFirstNonNegativeIntegerTag(event.tags, 'rtt-write')
  };
}

export function parseNip66RelayMonitorAnnouncement(
  event: Pick<NostrEvent, 'kind' | 'pubkey' | 'created_at' | 'tags'>
): Nip66RelayMonitorAnnouncement | null {
  if (event.kind !== NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND) return null;
  return {
    monitorPubkey: event.pubkey,
    createdAt: event.created_at,
    frequencySeconds: parseFirstPositiveIntegerTag(event.tags, 'frequency'),
    checks: findTagValues(event.tags, 'c'),
    timeouts: parseNip66MonitorTimeouts(event.tags),
    geohashes: findTagValues(event.tags, 'g')
  };
}

export function calculateNip66RelayScore(discovery: Nip66RelayDiscovery): number {
  const samples = [discovery.rttOpenMs, discovery.rttReadMs, discovery.rttWriteMs].filter(
    (value): value is number => value !== null
  );
  if (samples.length === 0) return 0;
  const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return Number((1 / (1 + averageMs / 1000)).toFixed(3));
}

function minNullable(...values: Array<number | null>): number | null {
  const normalized = values.filter((value): value is number => value !== null);
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
}

function findFirstTagValue(tags: readonly string[][], tagName: string): string | null {
  return tags.find((tag) => tag[0] === tagName && tag[1])?.[1] ?? null;
}

function findTagValues(tags: readonly string[][], tagName: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag[0] !== tagName || !tag[1]) continue;
    const value = tag[1].trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function parseUniqueIntegers(tags: readonly string[][], tagName: string): number[] {
  const values: number[] = [];
  const seen = new Set<number>();
  for (const tag of tags) {
    if (tag[0] !== tagName) continue;
    const value = parsePositiveInteger(tag[1]);
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function parseFirstPositiveIntegerTag(tags: readonly string[][], tagName: string): number | null {
  for (const tag of tags) {
    if (tag[0] !== tagName) continue;
    const value = parsePositiveInteger(tag[1]);
    if (value !== null) return value;
  }
  return null;
}

function parseFirstNonNegativeIntegerTag(
  tags: readonly string[][],
  tagName: string
): number | null {
  for (const tag of tags) {
    if (tag[0] !== tagName) continue;
    const value = parseNonNegativeInteger(tag[1]);
    if (value !== null) return value;
  }
  return null;
}

function parseNip66MonitorTimeouts(tags: readonly string[][]): Nip66RelayMonitorTimeout[] {
  const timeouts: Nip66RelayMonitorTimeout[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'timeout') continue;
    const first = tag[1];
    const second = tag[2];
    const firstAsTimeout = parsePositiveInteger(first);
    if (firstAsTimeout !== null) {
      timeouts.push({ check: second?.trim() || 'all', timeoutMs: firstAsTimeout });
      continue;
    }

    const secondAsTimeout = parsePositiveInteger(second);
    if (secondAsTimeout !== null) {
      timeouts.push({ check: first?.trim() || 'all', timeoutMs: secondAsTimeout });
    }
  }
  return timeouts;
}

function parsePositiveInteger(value: string | undefined): number | null {
  const parsed = parseNonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  return Number.parseInt(value, 10);
}

function normalizePositiveInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

function extractFirstPositiveInteger(value: string): number | null {
  const match = value.match(/\b([1-9][0-9]*)\b/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function resolveSource(input: {
  readonly hasFreshNip11: boolean;
  readonly hasLearned: boolean;
  readonly hasOverride: boolean;
}): RelayCapabilitySource {
  const count = [input.hasFreshNip11, input.hasLearned, input.hasOverride].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (input.hasOverride) return 'override';
  if (input.hasLearned) return 'learned';
  if (input.hasFreshNip11) return 'nip11';
  return 'unknown';
}
