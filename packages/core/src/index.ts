import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';
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

export function normalizeRelayObservation(
  url: string,
  connection: RelayConnectionState,
  reason: RelayObservationReason
): RelayObservation {
  return {
    url,
    connection,
    replaying: connection === 'replaying',
    degraded: connection === 'degraded' || connection === 'backoff' || connection === 'closed',
    reason
  };
}

export function normalizeRelayObservationPacket(packet: {
  readonly from: string;
  readonly state: RelayConnectionState;
  readonly reason: RelayObservationReason;
  readonly aggregate: SessionObservation;
}): RelayObservationPacket {
  return {
    ...packet,
    relay: normalizeRelayObservation(packet.from, packet.state, packet.reason)
  };
}

export function normalizeRelayObservationSnapshot(snapshot: {
  readonly url: string;
  readonly connection: RelayConnectionState;
  readonly reason: RelayObservationReason;
  readonly aggregate: SessionObservation;
}): RelayObservationSnapshot {
  return {
    url: snapshot.url,
    relay: normalizeRelayObservation(snapshot.url, snapshot.connection, snapshot.reason),
    aggregate: snapshot.aggregate
  };
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

function encodeHexEntity(prefix: 'npub' | 'note', hex: string): string {
  return bech32.encode(prefix, bech32.toWords(hexToBytes(hex)), 5000);
}

function pushTlv(target: number[], type: number, payload: Uint8Array): void {
  if (payload.length > 0xff) {
    throw new Error(`TLV payload too large for NIP-19: ${payload.length}`);
  }
  target.push(type, payload.length, ...payload);
}

function encodeTlv(prefix: 'nprofile' | 'nevent', entries: Array<[number, Uint8Array]>): string {
  const bytes: number[] = [];
  for (const [type, payload] of [...entries].sort((left, right) => right[0] - left[0])) {
    pushTlv(bytes, type, payload);
  }
  return bech32.encode(prefix, bech32.toWords(Uint8Array.from(bytes)), 5000);
}

function decodeTlv(bytes: Uint8Array): Map<number, Uint8Array[]> {
  const entries = new Map<number, Uint8Array[]>();
  let index = 0;
  while (index < bytes.length) {
    const type = bytes[index];
    const length = bytes[index + 1];
    const value = bytes.slice(index + 2, index + 2 + length);
    const list = entries.get(type) ?? [];
    list.push(value);
    entries.set(type, list);
    index += 2 + length;
  }
  return entries;
}

function serializeEvent(event: UnsignedNostrEvent & { pubkey: string }): string {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function getPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

export function finalizeEvent(event: UnsignedNostrEvent, secretKey: Uint8Array): SignedNostrEvent {
  const pubkey = getPublicKey(secretKey);
  const id = bytesToHex(sha256(new TextEncoder().encode(serializeEvent({ ...event, pubkey }))));
  const sig = bytesToHex(schnorr.sign(id, secretKey));
  return { ...event, id, pubkey, sig };
}

export async function verifier(event: Partial<SignedNostrEvent>): Promise<boolean> {
  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    typeof event.kind !== 'number' ||
    typeof event.created_at !== 'number' ||
    typeof event.content !== 'string' ||
    !Array.isArray(event.tags)
  ) {
    return false;
  }

  const serializedId = bytesToHex(
    sha256(
      new TextEncoder().encode(
        serializeEvent({
          pubkey: event.pubkey,
          kind: event.kind,
          created_at: event.created_at,
          tags: event.tags as string[][],
          content: event.content
        })
      )
    )
  );

  if (serializedId != event.id) return false;

  try {
    return schnorr.verify(event.sig, event.id, event.pubkey);
  } catch {
    return false;
  }
}

export function generateSecretKey(): Uint8Array {
  return secp256k1.utils.randomSecretKey();
}

export { bytesToHex, hexToBytes };

export function npubEncode(pubkey: string): string {
  return encodeHexEntity('npub', pubkey);
}

export function noteEncode(eventId: string): string {
  return encodeHexEntity('note', eventId);
}

export function nprofileEncode(input: { pubkey: string; relays?: string[] }): string {
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(input.pubkey)]];
  for (const relay of input.relays ?? []) {
    entries.push([1, new TextEncoder().encode(relay)]);
  }
  return encodeTlv('nprofile', entries);
}

export function neventEncode(input: {
  id: string;
  relays?: string[];
  author?: string;
  kind?: number;
}): string {
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(input.id)]];
  for (const relay of input.relays ?? []) {
    entries.push([1, new TextEncoder().encode(relay)]);
  }
  if (input.author) entries.push([2, hexToBytes(input.author)]);
  if (input.kind !== undefined) {
    const kind = new Uint8Array(4);
    new DataView(kind.buffer).setUint32(0, input.kind, false);
    entries.push([3, kind]);
  }
  return encodeTlv('nevent', entries);
}

export function decodeNip19(value: string): Nip19Decoded | null {
  try {
    const decoded = bech32.decodeToBytes(value as `${string}1${string}`);
    switch (decoded.prefix) {
      case 'npub':
        return { type: 'npub', pubkey: bytesToHex(decoded.bytes) };
      case 'note':
        return { type: 'note', eventId: bytesToHex(decoded.bytes) };
      case 'nprofile': {
        const tlv = decodeTlv(decoded.bytes);
        const pubkey = tlv.get(0)?.[0];
        if (!pubkey) return null;
        return {
          type: 'nprofile',
          pubkey: bytesToHex(pubkey),
          relays: (tlv.get(1) ?? []).map((entry) => new TextDecoder().decode(entry))
        };
      }
      case 'nevent': {
        const tlv = decodeTlv(decoded.bytes);
        const eventId = tlv.get(0)?.[0];
        if (!eventId) return null;
        const author = tlv.get(2)?.[0];
        const kindBytes = tlv.get(3)?.[0];
        return {
          type: 'nevent',
          eventId: bytesToHex(eventId),
          relays: (tlv.get(1) ?? []).map((entry) => new TextDecoder().decode(entry)),
          author: author ? bytesToHex(author) : undefined,
          kind:
            kindBytes && kindBytes.length === 4
              ? new DataView(
                  kindBytes.buffer,
                  kindBytes.byteOffset,
                  kindBytes.byteLength
                ).getUint32(0, false)
              : undefined
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
