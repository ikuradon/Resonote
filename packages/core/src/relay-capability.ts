export type RelayCapabilitySource = 'unknown' | 'nip11' | 'learned' | 'mixed' | 'override';
export type RelayCapabilityNip11Status = 'unknown' | 'ok' | 'failed';

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

export interface RelayCapabilitySnapshot extends Omit<RelayExecutionCapability, 'relayUrl'> {
  readonly url: string;
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
}

export interface RelayCapabilityPacket {
  readonly from: string;
  readonly capability: RelayCapabilitySnapshot;
}

export interface RelayCapabilityLearningEvent {
  readonly relayUrl: string;
  readonly kind: 'maxFilters' | 'maxSubscriptions';
  readonly value: number;
  readonly reason: string;
}

export interface RelayRuntimeCapabilityState extends RelayExecutionCapability {
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
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

export function normalizeRelayCapabilitySnapshot(
  state: RelayRuntimeCapabilityState
): RelayCapabilitySnapshot {
  return {
    url: state.relayUrl,
    maxFilters: state.maxFilters,
    maxSubscriptions: state.maxSubscriptions,
    supportedNips: [...state.supportedNips],
    source: state.source,
    expiresAt: state.expiresAt,
    stale: state.stale,
    queueDepth: state.queueDepth,
    activeSubscriptions: state.activeSubscriptions
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

function minNullable(...values: Array<number | null>): number | null {
  const normalized = values.filter((value): value is number => value !== null);
  if (normalized.length === 0) return null;
  return Math.min(...normalized);
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
