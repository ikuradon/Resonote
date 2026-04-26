import type { Event as NostrEvent } from 'nostr-typedef';

export type AggregateSessionState =
  | 'booting'
  | 'connecting'
  | 'live'
  | 'replaying'
  | 'degraded'
  | 'disposed';

export type RelayConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'backoff'
  | 'replaying'
  | 'degraded'
  | 'closed';

export type RelayObservationReason =
  | 'boot'
  | 'connecting'
  | 'opened'
  | 'disconnected'
  | 'connect-failed'
  | 'idle-timeout'
  | 'reconnect-scheduled'
  | 'retry-exhausted'
  | 'replay-started'
  | 'replay-finished'
  | 'replay-failed'
  | 'disposed';

export type AggregateSessionReason =
  | 'boot'
  | 'relay-opened'
  | 'relay-disconnected'
  | 'relay-replaying'
  | 'relay-degraded'
  | 'disposed';

export interface RelayObservation {
  readonly url: string;
  readonly connection: RelayConnectionState;
  readonly replaying: boolean;
  readonly degraded: boolean;
  readonly reason: RelayObservationReason;
}

export interface SessionObservation {
  readonly state: AggregateSessionState;
  readonly reason: AggregateSessionReason;
  readonly relays: readonly RelayObservation[];
}

export interface RelayObservationPacket {
  readonly from: string;
  readonly state: RelayConnectionState;
  readonly reason: RelayObservationReason;
  readonly relay: RelayObservation;
  readonly aggregate: SessionObservation;
}

export interface RelayObservationSnapshot {
  readonly url: string;
  readonly relay: RelayObservation;
  readonly aggregate: SessionObservation;
}

export interface RelayObservationRuntime {
  getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null>;
  observeRelayConnectionStates(
    onPacket: (packet: RelayObservationPacket) => void
  ): Promise<{ unsubscribe(): void }>;
}

export type RelayOverlayPolicy = 'restrict' | 'prefer' | 'augment';

export interface RelayOverlay {
  readonly policy: RelayOverlayPolicy;
  readonly relays: readonly string[];
}

export type ReadSettlementPhase = 'pending' | 'partial' | 'settled';
export type ReadSettlementProvenance = 'memory' | 'store' | 'relay' | 'mixed' | 'none';
export type ReadSettlementLocalProvenance = Extract<ReadSettlementProvenance, 'memory' | 'store'>;
export type ReadSettlementReason =
  | 'cache-hit'
  | 'cache-miss'
  | 'null-ttl-hit'
  | 'relay-repair'
  | 'replay-restore'
  | 'negentropy-repair'
  | 'invalidated-during-fetch'
  | 'settled-miss';

export interface ReadSettlement {
  readonly phase: ReadSettlementPhase;
  readonly provenance: ReadSettlementProvenance;
  readonly reason: ReadSettlementReason;
}

export type PublishSettlementPhase = 'pending' | 'partial' | 'settled';
export type PublishSettlementState = 'confirmed' | 'queued' | 'retrying' | 'rejected';
export type PublishSettlementDurability = 'local' | 'queued' | 'relay' | 'degraded';
export type PublishSettlementReason =
  | 'local-materialized'
  | 'relay-accepted'
  | 'queued-offline'
  | 'retrying-offline'
  | 'rejected-offline'
  | 'materialization-degraded';

export interface PublishSettlement {
  readonly phase: PublishSettlementPhase;
  readonly state: PublishSettlementState;
  readonly durability: PublishSettlementDurability;
  readonly reason: PublishSettlementReason;
}

export type NegentropyCapability = 'supported' | 'unsupported' | 'failed';

export interface NegentropyTransportResult {
  readonly capability: NegentropyCapability;
  readonly reason?: string;
  readonly messageHex?: string;
}

export type ReconcileReasonCode =
  | 'accepted-new'
  | 'ignored-duplicate'
  | 'ignored-older'
  | 'replaced-winner'
  | 'tombstoned'
  | 'confirmed-offline'
  | 'rejected-offline'
  | 'repaired-replay'
  | 'repaired-negentropy'
  | 'restored-replay'
  | 'conflict-shadowed-local';

export type ConsumerVisibleState =
  | 'pending-local'
  | 'confirmed'
  | 'shadowed'
  | 'deleted'
  | 'rejected'
  | 'repairing';

export interface QueryDescriptor {
  readonly id: string;
  readonly filters: readonly Record<string, unknown>[];
  readonly overlay?: RelayOverlay;
}

declare const requestKeyBrand: unique symbol;

export type RequestKey = string & {
  readonly [requestKeyBrand]: true;
};

export interface LogicalRequestDescriptor {
  readonly mode: 'backward' | 'forward';
  readonly filters: readonly Record<string, unknown>[];
  readonly overlay?: Record<string, unknown>;
  readonly scope?: string;
  readonly window?: {
    readonly cursor?: number | string | null;
    readonly limit?: number | null;
  };
}

export interface OrderedEventCursor {
  readonly created_at: number;
  readonly id: string;
}

export type OrderedEventTraversalDirection = 'asc' | 'desc';

export interface OrderedEventTraversalOptions {
  readonly cursor?: OrderedEventCursor | null;
  readonly direction?: OrderedEventTraversalDirection;
  readonly limit?: number;
  readonly kinds?: readonly number[];
}

export interface ProjectionTraversalOptions extends Omit<OrderedEventTraversalOptions, 'kinds'> {
  readonly sortKey?: string;
}

export function toOrderedEventCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>
): OrderedEventCursor {
  return {
    created_at: event.created_at,
    id: event.id
  };
}

export interface ProjectionSortCapability {
  readonly key: string;
  readonly pushdownSupported: boolean;
}

export interface ProjectionDefinition {
  readonly name: string;
  readonly sorts: readonly ProjectionSortCapability[];
  readonly sourceKinds: readonly number[];
}

export function defineProjection(definition: ProjectionDefinition): ProjectionDefinition {
  const name = definition.name.trim();
  if (!name) {
    throw new Error('Projection name is required');
  }

  if (definition.sourceKinds.length === 0) {
    throw new Error(`Projection must declare source kinds: ${name}`);
  }

  if (definition.sorts.length === 0) {
    throw new Error(`Projection must declare at least one sort: ${name}`);
  }

  const sortKeys = new Set<string>();
  for (const sort of definition.sorts) {
    const key = sort.key.trim();
    if (!key) {
      throw new Error(`Projection sort key is required: ${name}`);
    }
    if (sortKeys.has(key)) {
      throw new Error(`Projection sort key must be unique: ${name}:${key}`);
    }
    sortKeys.add(key);
  }

  return {
    name,
    sourceKinds: [...definition.sourceKinds],
    sorts: definition.sorts.map((sort) => ({ ...sort }))
  };
}

export function getProjectionSortCapability(
  definition: ProjectionDefinition,
  key: string
): ProjectionSortCapability | undefined {
  return definition.sorts.find((sort) => sort.key === key);
}

export interface ProjectionRegistry {
  register(definition: ProjectionDefinition): void;
  get(name: string): ProjectionDefinition | undefined;
  list(): ProjectionDefinition[];
}

export interface NamedRegistration<TValue = unknown> {
  readonly name: string;
  readonly value: TValue;
}

export interface NamedRegistrationRegistry<TValue = unknown> {
  register(registration: NamedRegistration<TValue>): void;
  get(name: string): NamedRegistration<TValue> | undefined;
  list(): Array<NamedRegistration<TValue>>;
}

export function createNamedRegistrationRegistry<TValue>(
  label: string
): NamedRegistrationRegistry<TValue> {
  const normalizedLabel = label.trim() || 'registration';
  const registrations = new Map<string, NamedRegistration<TValue>>();

  return {
    register(registration) {
      const name = registration.name.trim();
      if (!name) {
        throw new Error(`${normalizedLabel} name is required`);
      }
      if (registrations.has(name)) {
        throw new Error(`${normalizedLabel} already registered: ${name}`);
      }

      registrations.set(name, { name, value: registration.value });
    },
    get(name) {
      return registrations.get(name);
    },
    list() {
      return [...registrations.values()];
    }
  };
}

export function createProjectionRegistry(): ProjectionRegistry {
  const definitions = new Map<string, ProjectionDefinition>();

  return {
    register(definition) {
      const normalized = defineProjection(definition);
      if (definitions.has(normalized.name)) {
        throw new Error(`Projection already registered: ${normalized.name}`);
      }
      definitions.set(normalized.name, normalized);
    },
    get(name) {
      return definitions.get(name);
    },
    list() {
      return [...definitions.values()];
    }
  };
}

export type StoredEvent = Pick<
  NostrEvent,
  'id' | 'pubkey' | 'content' | 'created_at' | 'tags' | 'kind'
>;

export interface UnsignedNostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface SignedNostrEvent extends UnsignedNostrEvent {
  id: string;
  pubkey: string;
  sig: string;
}

export type Nip19Decoded =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string };
