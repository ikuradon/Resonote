import {
  buildRelaySelectionPlan,
  parseNip65RelayListTags,
  type RelaySelectionCandidate,
  type RelaySelectionIntent,
  type RelaySelectionPolicyOptions,
  type RelaySelectionRole,
  type StoredEvent
} from '@auftakt/core';

export const RELAY_LIST_KIND = 10002;

export const DEFAULT_RELAY_SELECTION_POLICY: RelaySelectionPolicyOptions = {
  strategy: 'conservative-outbox',
  maxReadRelays: 4,
  maxWriteRelays: 4,
  maxTemporaryRelays: 2,
  maxAudienceRelays: 2
};

export interface RelaySelectionRuntime {
  getDefaultRelays?(): Promise<readonly string[]> | readonly string[];
  getEventsDB(): Promise<{
    getByPubkeyAndKind?(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getByReplaceKey?(pubkey: string, kind: number, dTag: string): Promise<StoredEvent | null>;
    getRelayHints?(eventId: string): Promise<
      Array<{
        readonly eventId: string;
        readonly relayUrl: string;
        readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
        readonly lastSeenAt: number;
      }>
    >;
  }>;
}

export interface ReadRelayOverlay {
  readonly relays: readonly string[];
  readonly includeDefaultReadRelays?: boolean;
}

export interface PublishRelaySendOptions {
  readonly on?: {
    readonly relays?: readonly string[];
    readonly defaultWriteRelays?: boolean;
  };
}

export interface RelaySelectionPublishEvent {
  readonly kind: number;
  readonly tags?: readonly (readonly string[])[];
  readonly id?: string;
  readonly pubkey?: string;
}

type RelaySelectionDb = Awaited<ReturnType<RelaySelectionRuntime['getEventsDB']>>;

interface AddressableTagReference {
  readonly kind: number;
  readonly pubkey: string;
  readonly dTag: string;
}

export async function buildReadRelayOverlay(
  runtime: RelaySelectionRuntime,
  input: {
    readonly intent: Extract<RelaySelectionIntent, 'read' | 'subscribe' | 'repair'>;
    readonly filters: readonly Record<string, unknown>[];
    readonly temporaryRelays?: readonly string[];
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<ReadRelayOverlay | undefined> {
  const policy = input.policy ?? DEFAULT_RELAY_SELECTION_POLICY;
  const candidates: RelaySelectionCandidate[] = [];
  candidates.push(...(await defaultCandidates(runtime, 'read')));
  candidates.push(...temporaryCandidates(input.temporaryRelays ?? []));

  const db = await runtime.getEventsDB();
  const eventIds = collectFilterStrings(input.filters, 'ids');
  for (const eventId of eventIds) {
    candidates.push(...(await durableHintCandidates(db, eventId, 'read')));
  }

  const authors = collectFilterStrings(input.filters, 'authors');
  for (const pubkey of authors) {
    candidates.push(...(await authorWriteCandidatesForRead(db, pubkey)));
  }

  const plan = buildRelaySelectionPlan({
    intent: input.intent,
    policy,
    candidates
  });
  const relays = [...plan.temporaryRelays, ...plan.readRelays];
  if (relays.length === 0) return undefined;

  return {
    relays,
    includeDefaultReadRelays: false
  };
}

export async function buildPublishRelaySendOptions(
  runtime: RelaySelectionRuntime,
  input: {
    readonly event: RelaySelectionPublishEvent;
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<PublishRelaySendOptions | undefined> {
  const policy = input.policy ?? DEFAULT_RELAY_SELECTION_POLICY;
  const db = await runtime.getEventsDB();
  const tags = input.event.tags ?? [];
  const candidates: RelaySelectionCandidate[] = [];

  candidates.push(...(await defaultCandidates(runtime, 'write')));
  if (typeof input.event.pubkey === 'string') {
    candidates.push(...(await authorWriteCandidates(db, input.event.pubkey)));
  }

  for (const eventId of collectTagValues(tags, new Set(['e', 'q']))) {
    candidates.push(...(await durableHintCandidates(db, eventId, 'write')));
  }
  for (const relay of collectExplicitRelayHints(tags)) {
    candidates.push({ relay, source: 'audience', role: 'write' });
  }
  for (const pubkey of collectTagValues(tags, new Set(['p']))) {
    if (typeof input.event.pubkey === 'string' && pubkey === input.event.pubkey) continue;
    candidates.push(...(await audienceRelayCandidates(db, pubkey)));
  }
  candidates.push(...(await addressableTargetCandidates(db, tags)));

  const plan = buildRelaySelectionPlan({
    intent: publishIntentForKind(input.event.kind, tags),
    policy,
    candidates
  });
  const relays = [...plan.writeRelays, ...plan.temporaryRelays];
  if (relays.length === 0) return undefined;

  return {
    on: {
      relays,
      defaultWriteRelays: false
    }
  };
}

async function defaultCandidates(
  runtime: RelaySelectionRuntime,
  role: RelaySelectionRole
): Promise<RelaySelectionCandidate[]> {
  const defaults = runtime.getDefaultRelays ? await runtime.getDefaultRelays() : [];
  return [...defaults].map((relay) => ({ relay, source: 'default' as const, role }));
}

function temporaryCandidates(relays: readonly string[]): RelaySelectionCandidate[] {
  return relays.map((relay) => ({ relay, source: 'temporary-hint' as const, role: 'temporary' }));
}

async function durableHintCandidates(
  db: RelaySelectionDb,
  eventId: string,
  role: RelaySelectionRole
): Promise<RelaySelectionCandidate[]> {
  const hints = (await db.getRelayHints?.(eventId)) ?? [];
  return hints.map((hint) => ({ relay: hint.relayUrl, source: 'durable-hint' as const, role }));
}

async function authorWriteCandidates(
  db: RelaySelectionDb,
  pubkey: string
): Promise<RelaySelectionCandidate[]> {
  const relayList = await db.getByPubkeyAndKind?.(pubkey, RELAY_LIST_KIND);
  const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
  return entries.flatMap((entry) =>
    entry.write
      ? [{ relay: entry.relay, source: 'nip65-write' as const, role: 'write' as const }]
      : []
  );
}

async function authorWriteCandidatesForRead(
  db: RelaySelectionDb,
  pubkey: string
): Promise<RelaySelectionCandidate[]> {
  const relayList = await db.getByPubkeyAndKind?.(pubkey, RELAY_LIST_KIND);
  const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
  return entries.flatMap((entry) =>
    entry.write
      ? [{ relay: entry.relay, source: 'nip65-write' as const, role: 'read' as const }]
      : []
  );
}

async function audienceRelayCandidates(
  db: RelaySelectionDb,
  pubkey: string
): Promise<RelaySelectionCandidate[]> {
  const relayList = await db.getByPubkeyAndKind?.(pubkey, RELAY_LIST_KIND);
  const entries = relayList ? parseNip65RelayListTags(relayList.tags) : [];
  return entries.flatMap((entry) =>
    entry.read ? [{ relay: entry.relay, source: 'audience' as const, role: 'write' as const }] : []
  );
}

async function addressableTargetCandidates(
  db: RelaySelectionDb,
  tags: readonly (readonly string[])[]
): Promise<RelaySelectionCandidate[]> {
  if (typeof db.getByReplaceKey !== 'function') return [];

  const candidates: RelaySelectionCandidate[] = [];
  for (const reference of collectAddressableTagReferences(tags)) {
    const target = await db.getByReplaceKey(reference.pubkey, reference.kind, reference.dTag);
    if (!target) continue;
    candidates.push(...(await durableHintCandidates(db, target.id, 'write')));
  }
  return candidates;
}

function collectFilterStrings(filters: readonly Record<string, unknown>[], key: string): string[] {
  const values = new Set<string>();
  for (const filter of filters) {
    const raw = filter[key];
    if (!Array.isArray(raw)) continue;
    for (const value of raw) {
      if (typeof value === 'string') values.add(value);
    }
  }
  return [...values].sort();
}

function collectTagValues(tags: readonly (readonly string[])[], names: Set<string>): string[] {
  const values = new Set<string>();
  for (const tag of tags) {
    if (!names.has(tag[0] ?? '') || typeof tag[1] !== 'string') continue;
    values.add(tag[1]);
  }
  return [...values].sort();
}

function collectAddressableTagReferences(
  tags: readonly (readonly string[])[]
): AddressableTagReference[] {
  const values = new Map<string, AddressableTagReference>();
  for (const tag of tags) {
    if (tag[0] !== 'a' || typeof tag[1] !== 'string') continue;
    const parsed = parseAddressableTagValue(tag[1]);
    if (!parsed) continue;
    values.set(`${parsed.kind}:${parsed.pubkey}:${parsed.dTag}`, parsed);
  }
  return [...values.values()].sort((left, right) => {
    const kindOrder = left.kind - right.kind;
    if (kindOrder !== 0) return kindOrder;
    const pubkeyOrder = left.pubkey.localeCompare(right.pubkey);
    if (pubkeyOrder !== 0) return pubkeyOrder;
    return left.dTag.localeCompare(right.dTag);
  });
}

function parseAddressableTagValue(value: string): AddressableTagReference | null {
  const firstSeparator = value.indexOf(':');
  const secondSeparator = firstSeparator === -1 ? -1 : value.indexOf(':', firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) return null;

  const kind = Number(value.slice(0, firstSeparator));
  const pubkey = value.slice(firstSeparator + 1, secondSeparator);
  const dTag = value.slice(secondSeparator + 1);
  if (!Number.isInteger(kind) || kind < 0) return null;
  if (pubkey.length === 0 || dTag.length === 0) return null;

  return { kind, pubkey, dTag };
}

function collectExplicitRelayHints(tags: readonly (readonly string[])[]): string[] {
  const values = new Set<string>();
  for (const tag of tags) {
    if ((tag[0] === 'e' || tag[0] === 'q' || tag[0] === 'p') && typeof tag[2] === 'string') {
      values.add(tag[2]);
      continue;
    }
    if (
      tag[0] === 'a' &&
      typeof tag[1] === 'string' &&
      parseAddressableTagValue(tag[1]) &&
      typeof tag[2] === 'string'
    ) {
      values.add(tag[2]);
    }
  }
  return [...values].sort();
}

function publishIntentForKind(
  kind: number,
  tags: readonly (readonly string[])[]
): Extract<RelaySelectionIntent, 'publish' | 'reply' | 'reaction' | 'mention'> {
  if (kind === 7) return 'reaction';
  if (tags.some((tag) => tag[0] === 'e' || tag[0] === 'q')) return 'reply';
  if (tags.some((tag) => tag[0] === 'p')) return 'mention';
  return 'publish';
}
