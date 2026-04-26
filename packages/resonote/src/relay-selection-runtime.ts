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

export const RESONOTE_DEFAULT_RELAY_SELECTION_POLICY: RelaySelectionPolicyOptions = {
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

type RelaySelectionDb = Awaited<ReturnType<RelaySelectionRuntime['getEventsDB']>>;

export async function buildReadRelayOverlay(
  runtime: RelaySelectionRuntime,
  input: {
    readonly intent: Extract<RelaySelectionIntent, 'read' | 'subscribe' | 'repair'>;
    readonly filters: readonly Record<string, unknown>[];
    readonly temporaryRelays?: readonly string[];
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<ReadRelayOverlay | undefined> {
  const policy = input.policy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
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
    readonly event: Pick<StoredEvent, 'kind' | 'tags'> &
      Partial<Pick<StoredEvent, 'id' | 'pubkey'>>;
    readonly policy?: RelaySelectionPolicyOptions;
  }
): Promise<PublishRelaySendOptions | undefined> {
  const policy = input.policy ?? RESONOTE_DEFAULT_RELAY_SELECTION_POLICY;
  const db = await runtime.getEventsDB();
  const candidates: RelaySelectionCandidate[] = [];

  candidates.push(...(await defaultCandidates(runtime, 'write')));
  if (typeof input.event.pubkey === 'string') {
    candidates.push(...(await authorWriteCandidates(db, input.event.pubkey)));
  }

  for (const eventId of collectTagValues(input.event.tags, new Set(['e', 'q']))) {
    candidates.push(...(await durableHintCandidates(db, eventId, 'write')));
  }
  for (const relay of collectExplicitRelayHints(input.event.tags)) {
    candidates.push({ relay, source: 'audience', role: 'write' });
  }
  for (const pubkey of collectTagValues(input.event.tags, new Set(['p']))) {
    if (typeof input.event.pubkey === 'string' && pubkey === input.event.pubkey) continue;
    candidates.push(...(await audienceRelayCandidates(db, pubkey)));
  }

  const plan = buildRelaySelectionPlan({
    intent: publishIntentForKind(input.event.kind, input.event.tags),
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

function collectExplicitRelayHints(tags: readonly (readonly string[])[]): string[] {
  const values = new Set<string>();
  for (const tag of tags) {
    if ((tag[0] === 'e' || tag[0] === 'q' || tag[0] === 'p') && typeof tag[2] === 'string') {
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
