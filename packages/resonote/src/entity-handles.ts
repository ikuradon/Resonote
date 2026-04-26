import {
  buildRelaySelectionPlan,
  normalizeRelayUrl,
  type ReadSettlement,
  type RelaySelectionCandidate,
  type RelaySelectionDiagnostic,
  type RelaySelectionPolicyOptions,
  type StoredEvent
} from '@auftakt/core';

export type EntityHandleState =
  | 'missing'
  | 'local'
  | 'partial'
  | 'relay-confirmed'
  | 'deleted'
  | 'repaired';

export interface EntityFetchOptions {
  readonly cacheOnly?: boolean;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export interface EventHandleInput {
  readonly id: string;
  readonly relayHints?: readonly string[];
}

export interface UserHandleInput {
  readonly pubkey: string;
}

export interface AddressableHandleInput {
  readonly kind: number;
  readonly pubkey: string;
  readonly d: string;
}

export type RelaySetSubject =
  | {
      readonly type: 'event';
      readonly id: string;
      readonly relayHints?: readonly string[];
    }
  | { readonly type: 'user'; readonly pubkey: string }
  | {
      readonly type: 'addressable';
      readonly kind: number;
      readonly pubkey: string;
      readonly d: string;
    };

export interface EntityReadResult<TValue> {
  readonly value: TValue | null;
  readonly sourceEvent: StoredEvent | null;
  readonly settlement: ReadSettlement;
  readonly state: EntityHandleState;
}

export interface UserProfileReadResult extends EntityReadResult<Record<string, unknown>> {
  readonly profile: Record<string, unknown> | null;
}

export interface NormalizedRelayHint {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
  readonly lastSeenAt: number;
}

export interface RelayHintsReadResult {
  readonly eventId: string;
  readonly hints: readonly NormalizedRelayHint[];
}

export interface RelaySetSnapshot {
  readonly subject: RelaySetSubject;
  readonly readRelays: readonly string[];
  readonly writeRelays: readonly string[];
  readonly temporaryRelays: readonly string[];
  readonly diagnostics: readonly RelaySelectionDiagnostic[];
}

export interface EventHandle {
  readonly id: string;
  fetch(options?: EntityFetchOptions): Promise<EntityReadResult<StoredEvent>>;
}

export interface UserHandle {
  readonly pubkey: string;
  fetchProfile(options?: EntityFetchOptions): Promise<UserProfileReadResult>;
}

export interface AddressableHandle {
  readonly kind: number;
  readonly pubkey: string;
  readonly d: string;
  fetch(options?: EntityFetchOptions): Promise<EntityReadResult<StoredEvent>>;
}

export interface RelaySetHandle {
  readonly subject: RelaySetSubject;
  snapshot(): Promise<RelaySetSnapshot>;
}

export interface RelayHintsHandle {
  readonly eventId: string;
  fetch(): Promise<RelayHintsReadResult>;
}

export interface EntityHandleReadRuntime {
  read(
    filters: readonly Record<string, unknown>[],
    options: EntityFetchOptions,
    temporaryRelays: readonly string[]
  ): Promise<{
    readonly events: readonly StoredEvent[];
    readonly settlement: ReadSettlement;
  }>;
  isDeleted?(id: string, pubkey: string): Promise<boolean>;
}

export interface EntityHandleStoreRuntime {
  getRelayHints?(eventId: string): Promise<readonly NormalizedRelayHint[]>;
  getByPubkeyAndKind?(pubkey: string, kind: number): Promise<StoredEvent | null>;
}

export interface EntityHandleRuntime {
  readonly read: EntityHandleReadRuntime['read'];
  readonly isDeleted?: EntityHandleReadRuntime['isDeleted'];
  readonly openStore: () => Promise<EntityHandleStoreRuntime>;
  readonly snapshotRelaySet: (subject: RelaySetSubject) => Promise<RelaySetSnapshot>;
}

export interface EntityHandleFactories {
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
}

export function createEntityHandleFactories(runtime: EntityHandleRuntime): EntityHandleFactories {
  return {
    getEvent(input) {
      const id = normalizeHexId(input.id, 'event id');
      const relayHints = normalizeRelayHints(input.relayHints ?? []);
      return {
        id,
        async fetch(options = {}) {
          const result = await runtime.read([{ ids: [id] }], options, relayHints);
          return entityReadResult(result.events[0] ?? null, result.settlement, false);
        }
      };
    },
    getUser(input) {
      const pubkey = normalizeHexId(input.pubkey, 'pubkey');
      return {
        pubkey,
        async fetchProfile(options = {}) {
          const result = await runtime.read(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            options,
            []
          );
          const event = result.events[0] ?? null;
          const profile = parseProfile(event);
          const readResult = entityReadResult(profile, result.settlement, false, event);
          return {
            ...readResult,
            state: deriveEntityHandleState({ value: event, settlement: result.settlement }),
            profile
          };
        }
      };
    },
    getAddressable(input) {
      const kind = normalizeKind(input.kind);
      const pubkey = normalizeHexId(input.pubkey, 'pubkey');
      const d = normalizeDTag(input.d);
      return {
        kind,
        pubkey,
        d,
        async fetch(options = {}) {
          const result = await runtime.read(
            [{ kinds: [kind], authors: [pubkey], '#d': [d], limit: 1 }],
            options,
            []
          );
          const event = result.events[0] ?? null;
          const deleted = event ? await runtime.isDeleted?.(event.id, event.pubkey) : false;
          return entityReadResult(event, result.settlement, deleted === true);
        }
      };
    },
    getRelaySet(subject) {
      const normalized = normalizeRelaySetSubject(subject);
      return {
        subject: normalized,
        snapshot: () => runtime.snapshotRelaySet(normalized)
      };
    },
    getRelayHints(eventId) {
      const id = normalizeHexId(eventId, 'event id');
      return {
        eventId: id,
        async fetch() {
          const store = await runtime.openStore();
          const hints = normalizeRelayHintRecords(await store.getRelayHints?.(id));
          return { eventId: id, hints };
        }
      };
    }
  };
}

export function deriveEntityHandleState(input: {
  readonly value: unknown;
  readonly settlement: ReadSettlement;
  readonly deleted?: boolean;
}): EntityHandleState {
  if (input.deleted === true) return 'deleted';
  if (input.settlement.reason === 'replay-restore') return 'repaired';
  if (input.settlement.reason === 'negentropy-repair') return 'repaired';
  if (input.settlement.phase === 'partial') return 'partial';
  if (input.value === null || input.value === undefined) return 'missing';
  if (input.settlement.provenance === 'relay' || input.settlement.provenance === 'mixed') {
    return 'relay-confirmed';
  }
  return 'local';
}

export function buildRelaySetSnapshot(input: {
  readonly subject: RelaySetSubject;
  readonly policy: RelaySelectionPolicyOptions;
  readonly candidates: readonly RelaySelectionCandidate[];
}): RelaySetSnapshot {
  const plan = buildRelaySelectionPlan({
    intent: 'read',
    policy: input.policy,
    candidates: input.candidates
  });
  return {
    subject: input.subject,
    readRelays: plan.readRelays,
    writeRelays: plan.writeRelays,
    temporaryRelays: plan.temporaryRelays,
    diagnostics: plan.diagnostics
  };
}

function entityReadResult<TValue>(
  value: TValue | null,
  settlement: ReadSettlement,
  deleted: boolean,
  sourceEvent: StoredEvent | null = isStoredEvent(value) ? value : null
): EntityReadResult<TValue> {
  return {
    value: deleted ? null : value,
    sourceEvent: deleted ? null : sourceEvent,
    settlement,
    state: deriveEntityHandleState({ value, settlement, deleted })
  };
}

function parseProfile(event: StoredEvent | null): Record<string, unknown> | null {
  if (!event) return null;
  try {
    const parsed = JSON.parse(event.content) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeHexId(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError(`Invalid ${label}: expected 64 hex characters`);
  }
  return value.toLowerCase();
}

function normalizeKind(kind: number): number {
  if (!Number.isInteger(kind) || kind < 0) {
    throw new TypeError('Invalid addressable kind: expected a non-negative integer');
  }
  return kind;
}

function normalizeDTag(d: string): string {
  if (d.length === 0) {
    throw new TypeError('Invalid addressable d tag: expected a non-empty string');
  }
  return d;
}

function normalizeRelaySetSubject(subject: RelaySetSubject): RelaySetSubject {
  if (subject.type === 'event') {
    const relayHints = normalizeRelayHints(subject.relayHints ?? []);
    return {
      type: 'event',
      id: normalizeHexId(subject.id, 'event id'),
      ...(relayHints.length > 0 ? { relayHints } : {})
    };
  }
  if (subject.type === 'user') {
    return { type: 'user', pubkey: normalizeHexId(subject.pubkey, 'pubkey') };
  }
  return {
    type: 'addressable',
    kind: normalizeKind(subject.kind),
    pubkey: normalizeHexId(subject.pubkey, 'pubkey'),
    d: normalizeDTag(subject.d)
  };
}

function normalizeRelayHints(relays: readonly string[]): string[] {
  return [...new Set(relays.flatMap((relay) => normalizeRelayUrl(relay) ?? []))].sort();
}

function normalizeRelayHintRecords(
  records: readonly NormalizedRelayHint[] | undefined
): NormalizedRelayHint[] {
  return [...(records ?? [])]
    .flatMap((record) => {
      const relayUrl = normalizeRelayUrl(record.relayUrl);
      if (!relayUrl) return [];
      return [{ ...record, relayUrl }];
    })
    .sort(
      (left, right) =>
        right.lastSeenAt - left.lastSeenAt || left.relayUrl.localeCompare(right.relayUrl)
    );
}

function isStoredEvent(value: unknown): value is StoredEvent {
  return typeof value === 'object' && value !== null && 'id' in value && 'pubkey' in value;
}
