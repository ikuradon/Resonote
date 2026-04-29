import type {
  NegentropyEventRef,
  NegentropyTransportResult,
  OrderedEventCursor,
  ReconcileEmission,
  RelayEventValidationFailureReason,
  RequestKey,
  StoredEvent
} from '@auftakt/core';
import {
  createNegentropyRepairRequestKey,
  filterNegentropyEventRefs,
  reconcileNegentropyRepairSubjects,
  reconcileReplayRepairSubjects,
  sortNegentropyEventRefsAsc,
  toOrderedEventCursor,
  validateRelayEvent
} from '@auftakt/core';

import { REPAIR_REQUEST_COALESCING_SCOPE } from './request-planning.js';

type RuntimeFilter = Record<string, unknown>;

export interface RelayRepairOptions {
  readonly relayUrl: string;
  readonly filters: readonly RuntimeFilter[];
  readonly timeoutMs?: number;
}

export interface RelayRepairResult {
  readonly strategy: 'negentropy' | 'fallback';
  readonly capability: NegentropyTransportResult['capability'];
  readonly repairedIds: readonly string[];
  readonly repairEmissions: readonly ReconcileEmission[];
  readonly materializationEmissions: readonly ReconcileEmission[];
}

export interface QuarantineRecord {
  readonly relayUrl: string;
  readonly eventId: string | null;
  readonly reason: RelayEventValidationFailureReason;
  readonly rawEvent: unknown;
}

export interface RelayRepairStore {
  listNegentropyEventRefs(): Promise<NegentropyEventRef[]>;
  getSyncCursor?(key: string): Promise<OrderedEventCursor | null>;
  putSyncCursor?(record: {
    readonly key: string;
    readonly relay: string;
    readonly requestKey: RequestKey;
    readonly cursor: OrderedEventCursor;
    readonly updatedAt: number;
  }): Promise<void>;
  putWithReconcile(event: StoredEvent): Promise<{
    stored: boolean;
    emissions: ReconcileEmission[];
  }>;
  putQuarantine?(record: QuarantineRecord): Promise<void>;
}

export interface RelayRepairRuntime {
  getEventsDB(): Promise<RelayRepairStore>;
  getRelaySession(): Promise<unknown>;
  createBackwardReq(options?: { requestKey?: RequestKey; coalescingScope?: string }): unknown;
}

interface NegentropySessionRuntime {
  requestNegentropySync?(options: {
    relayUrl: string;
    filter: Record<string, unknown>;
    initialMessageHex: string;
    timeoutMs?: number;
  }): Promise<NegentropyTransportResult>;
  use(
    req: { emit(input: unknown): void; over(): void },
    options: { on: { relays: readonly string[]; defaultReadRelays: boolean } }
  ): {
    subscribe(observer: {
      next?: (packet: { event: unknown }) => void;
      complete?: () => void;
      error?: (error: unknown) => void;
    }): { unsubscribe(): void };
  };
}

interface RepairSyncCursorState {
  readonly key: string;
  readonly relay: string;
  readonly requestKey: RequestKey;
}

const unsupportedNegentropyRelaysByRuntime = new WeakMap<object, Set<string>>();

function getUnsupportedNegentropyRelayCache(runtime: object): Set<string> {
  const existing = unsupportedNegentropyRelaysByRuntime.get(runtime);
  if (existing) return existing;

  const relays = new Set<string>();
  unsupportedNegentropyRelaysByRuntime.set(runtime, relays);
  return relays;
}

function cacheUnsupportedNegentropyRelay(runtime: object, relayUrl: string): void {
  getUnsupportedNegentropyRelayCache(runtime).add(relayUrl);
}

function isNegentropyRelayUnsupported(runtime: object, relayUrl: string): boolean {
  return getUnsupportedNegentropyRelayCache(runtime).has(relayUrl);
}

function encodeHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function decodeHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('negentropy hex payload must have even length');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (!Number.isFinite(value)) {
      throw new Error('negentropy hex payload contains invalid byte');
    }
    bytes[index / 2] = value;
  }
  return bytes;
}

function encodeVarint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('negentropy varint must be a non-negative integer');
  }

  const digits = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    digits.push(remaining & 0x7f);
    remaining >>>= 7;
  }

  return digits.reverse().map((digit, index) => (index < digits.length - 1 ? digit | 0x80 : digit));
}

function decodeVarint(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let index = start;

  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    index += 1;
    if ((byte & 0x80) === 0) {
      return { value, next: index };
    }
  }

  throw new Error('unterminated negentropy varint');
}

function encodeNegentropyIdListMessage(events: readonly NegentropyEventRef[]): string {
  const sorted = sortNegentropyEventRefsAsc(events);
  const bytes: number[] = [0x61, 0x00, 0x00, 0x02, ...encodeVarint(sorted.length)];

  for (const event of sorted) {
    if (!/^[0-9a-f]{64}$/i.test(event.id)) {
      throw new Error(`negentropy requires 32-byte hex ids, received: ${event.id}`);
    }
    bytes.push(...decodeHex(event.id));
  }

  return encodeHex(Uint8Array.from(bytes));
}

function decodeNegentropyIdListMessage(messageHex: string): string[] {
  const bytes = decodeHex(messageHex);
  if ((bytes[0] ?? 0) !== 0x61) {
    throw new Error('unsupported negentropy protocol version');
  }

  let index = 1;
  const ids: string[] = [];

  while (index < bytes.length) {
    const upperTimestamp = decodeVarint(bytes, index);
    index = upperTimestamp.next;
    const prefixLength = decodeVarint(bytes, index);
    index = prefixLength.next + prefixLength.value;

    const mode = decodeVarint(bytes, index);
    index = mode.next;

    if (mode.value === 0) {
      continue;
    }

    if (mode.value !== 2) {
      throw new Error(`unsupported negentropy mode: ${mode.value}`);
    }

    const listLength = decodeVarint(bytes, index);
    index = listLength.next;

    for (let count = 0; count < listLength.value; count += 1) {
      const nextIndex = index + 32;
      if (nextIndex > bytes.length) {
        throw new Error('truncated negentropy id list');
      }
      ids.push(encodeHex(bytes.slice(index, nextIndex)));
      index = nextIndex;
    }
  }

  return ids;
}

function chunkIds(ids: readonly string[], size = 50): RuntimeFilter[] {
  const chunks: RuntimeFilter[] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push({ ids: ids.slice(index, index + size) });
  }
  return chunks;
}

function createRepairSyncCursorState(input: {
  readonly relayUrl: string;
  readonly filters: readonly RuntimeFilter[];
  readonly scope: string;
}): RepairSyncCursorState {
  const requestKey = createNegentropyRepairRequestKey({
    filters: input.filters,
    relayUrl: input.relayUrl,
    scope: input.scope
  });

  return {
    key: `relay:${input.relayUrl}\nrequest:${requestKey}`,
    relay: input.relayUrl,
    requestKey
  };
}

async function loadRepairSyncCursor(
  eventsDB: RelayRepairStore,
  state: RepairSyncCursorState
): Promise<OrderedEventCursor | null> {
  if (typeof eventsDB.getSyncCursor !== 'function') return null;
  try {
    return await eventsDB.getSyncCursor(state.key);
  } catch {
    return null;
  }
}

function withRepairSyncCursorFilters(
  filters: readonly RuntimeFilter[],
  cursor: OrderedEventCursor | null
): RuntimeFilter[] {
  if (!cursor) return [...filters];

  return filters.map((filter) => {
    const since =
      typeof filter.since === 'number'
        ? Math.max(filter.since, cursor.created_at)
        : cursor.created_at;
    return { ...filter, since };
  });
}

function compareOrderedEventToCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor
): number {
  if (event.created_at !== cursor.created_at) return event.created_at - cursor.created_at;
  return event.id.localeCompare(cursor.id);
}

function isAfterRepairSyncCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor | null
): boolean {
  return !cursor || compareOrderedEventToCursor(event, cursor) > 0;
}

function newestRepairSyncCursor(
  events: readonly Pick<StoredEvent, 'created_at' | 'id'>[]
): OrderedEventCursor | null {
  const newest = [...events].sort((left, right) => {
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  })[0];
  return newest ? toOrderedEventCursor(newest) : null;
}

async function advanceRepairSyncCursor(
  eventsDB: RelayRepairStore,
  state: RepairSyncCursorState,
  events: readonly Pick<StoredEvent, 'created_at' | 'id'>[]
): Promise<void> {
  if (typeof eventsDB.putSyncCursor !== 'function') return;
  const cursor = newestRepairSyncCursor(events);
  if (!cursor) return;

  try {
    await eventsDB.putSyncCursor({
      key: state.key,
      relay: state.relay,
      requestKey: state.requestKey,
      cursor,
      updatedAt: Math.floor(Date.now() / 1000)
    });
  } catch {
    return;
  }
}

function getRawRelayEventId(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const id = (event as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

async function quarantineRelayEvent(
  runtime: RelayRepairRuntime,
  record: QuarantineRecord
): Promise<void> {
  try {
    const db = await runtime.getEventsDB();
    await db.putQuarantine?.(record);
  } catch {
    // Invalid relay input remains blocked even if diagnostics cannot be persisted.
  }
}

async function fetchRelayCandidateEventsFromRelay(
  runtime: RelayRepairRuntime,
  filters: readonly RuntimeFilter[],
  relayUrl: string,
  timeoutMs: number | undefined,
  scope: string
): Promise<unknown[]> {
  if (filters.length === 0) return [];

  const relaySession = (await runtime.getRelaySession()) as NegentropySessionRuntime;
  const req = runtime.createBackwardReq({
    requestKey: createNegentropyRepairRequestKey({ filters, relayUrl, scope }),
    coalescingScope: REPAIR_REQUEST_COALESCING_SCOPE
  }) as {
    emit(input: unknown): void;
    over(): void;
  };

  const candidates: unknown[] = [];

  return new Promise<unknown[]>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), timeoutMs ?? 10_000);

    const sub = relaySession
      .use(req, {
        on: {
          relays: [relayUrl],
          defaultReadRelays: false
        }
      })
      .subscribe({
        next: (packet) => {
          candidates.push(packet.event);
        },
        complete: () => finish(),
        error: () => finish()
      });

    for (const filter of filters) req.emit(filter);
    req.over();

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      resolve(candidates);
    }
  });
}

async function materializeRepairCandidates(
  runtime: RelayRepairRuntime,
  relayUrl: string,
  candidates: readonly unknown[],
  cursor: OrderedEventCursor | null
): Promise<{
  repairedIds: string[];
  repairedEvents: StoredEvent[];
  materializationEmissions: ReconcileEmission[];
}> {
  const repairedIds: string[] = [];
  const repairedEvents: StoredEvent[] = [];
  const materializationEmissions: ReconcileEmission[] = [];

  for (const candidate of candidates) {
    const validation = await validateRelayEvent(candidate);
    if (!validation.ok) {
      await quarantineRelayEvent(runtime, {
        relayUrl,
        eventId: getRawRelayEventId(candidate),
        reason: validation.reason,
        rawEvent: candidate
      });
      continue;
    }

    if (!isAfterRepairSyncCursor(validation.event, cursor)) continue;
    const eventsDB = await runtime.getEventsDB();
    const materialized = await eventsDB.putWithReconcile(validation.event);
    materializationEmissions.push(...materialized.emissions);
    if (!materialized.stored) continue;

    repairedIds.push(validation.event.id);
    repairedEvents.push(validation.event);
  }

  return {
    repairedIds,
    repairedEvents,
    materializationEmissions
  };
}

async function fallbackRepairEventsFromRelay(
  runtime: RelayRepairRuntime,
  options: RelayRepairOptions,
  capability: NegentropyTransportResult['capability']
): Promise<RelayRepairResult> {
  const eventsDB = await runtime.getEventsDB();
  const cursorState = createRepairSyncCursorState({
    relayUrl: options.relayUrl,
    filters: options.filters,
    scope: 'timeline:repair:fallback'
  });
  const cursor = await loadRepairSyncCursor(eventsDB, cursorState);
  const filters = withRepairSyncCursorFilters(options.filters, cursor);
  const fallbackCandidates = await fetchRelayCandidateEventsFromRelay(
    runtime,
    filters,
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:fallback'
  );
  const materialized = await materializeRepairCandidates(
    runtime,
    options.relayUrl,
    fallbackCandidates,
    cursor
  );
  await advanceRepairSyncCursor(eventsDB, cursorState, materialized.repairedEvents);

  return {
    strategy: 'fallback',
    capability,
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileReplayRepairSubjects(materialized.repairedIds, 'repaired-replay')
  };
}

export async function repairEventsFromRelay(
  runtime: RelayRepairRuntime,
  options: RelayRepairOptions
): Promise<RelayRepairResult> {
  const eventsDB = await runtime.getEventsDB();

  if (isNegentropyRelayUnsupported(runtime, options.relayUrl)) {
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const session = (await runtime.getRelaySession()) as Partial<NegentropySessionRuntime>;

  if (typeof session.requestNegentropySync !== 'function') {
    cacheUnsupportedNegentropyRelay(runtime, options.relayUrl);
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const cursorState = createRepairSyncCursorState({
    relayUrl: options.relayUrl,
    filters: options.filters,
    scope: 'timeline:repair:negentropy'
  });
  const cursor = await loadRepairSyncCursor(eventsDB, cursorState);
  const filters = withRepairSyncCursorFilters(options.filters, cursor);
  const localRefs = await eventsDB.listNegentropyEventRefs();
  const missingIds = new Set<string>();

  for (const filter of filters) {
    const selectedLocal = filterNegentropyEventRefs(localRefs, [filter]);

    let transportResult: NegentropyTransportResult;
    try {
      transportResult = await session.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter,
        initialMessageHex: encodeNegentropyIdListMessage(selectedLocal),
        timeoutMs: options.timeoutMs
      });
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    if (transportResult.capability !== 'supported') {
      if (transportResult.capability === 'unsupported') {
        cacheUnsupportedNegentropyRelay(runtime, options.relayUrl);
      }
      return fallbackRepairEventsFromRelay(runtime, options, transportResult.capability);
    }

    if (!transportResult.messageHex) {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    let remoteIds: string[];
    try {
      remoteIds = decodeNegentropyIdListMessage(transportResult.messageHex);
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    const localIds = new Set(selectedLocal.map((event) => event.id));
    for (const remoteId of remoteIds) {
      if (!localIds.has(remoteId)) {
        missingIds.add(remoteId);
      }
    }
  }

  const repairCandidates = await fetchRelayCandidateEventsFromRelay(
    runtime,
    chunkIds([...missingIds]),
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:negentropy:fetch'
  );
  const materialized = await materializeRepairCandidates(
    runtime,
    options.relayUrl,
    repairCandidates,
    cursor
  );
  await advanceRepairSyncCursor(eventsDB, cursorState, materialized.repairedEvents);

  return {
    strategy: 'negentropy',
    capability: 'supported',
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileNegentropyRepairSubjects(materialized.repairedIds)
  };
}
