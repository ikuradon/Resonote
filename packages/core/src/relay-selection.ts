export type RelaySelectionStrategy = 'default-only' | 'conservative-outbox' | 'strict-outbox';

export type RelaySelectionIntent =
  | 'read'
  | 'subscribe'
  | 'repair'
  | 'publish'
  | 'reply'
  | 'reaction'
  | 'mention';

export type RelayCandidateSource =
  | 'default'
  | 'nip65-read'
  | 'nip65-write'
  | 'temporary-hint'
  | 'durable-hint'
  | 'audience';

export type RelaySelectionRole = 'read' | 'write' | 'temporary';

export interface RelaySelectionPolicyOptions {
  readonly strategy: RelaySelectionStrategy;
  readonly maxReadRelays?: number;
  readonly maxWriteRelays?: number;
  readonly maxTemporaryRelays?: number;
  readonly maxAudienceRelays?: number;
  readonly includeDefaultFallback?: boolean;
  readonly allowTemporaryHints?: boolean;
  readonly includeDurableHints?: boolean;
  readonly includeAudienceRelays?: boolean;
}

export interface NormalizedRelaySelectionPolicy {
  readonly strategy: RelaySelectionStrategy;
  readonly maxReadRelays: number;
  readonly maxWriteRelays: number;
  readonly maxTemporaryRelays: number;
  readonly maxAudienceRelays: number;
  readonly includeDefaultFallback: boolean;
  readonly allowTemporaryHints: boolean;
  readonly includeDurableHints: boolean;
  readonly includeAudienceRelays: boolean;
}

export interface Nip65RelayListEntry {
  readonly relay: string;
  readonly read: boolean;
  readonly write: boolean;
}

export interface RelaySelectionCandidate {
  readonly relay: string;
  readonly source: RelayCandidateSource;
  readonly role: RelaySelectionRole;
}

export interface RelaySelectionDiagnostic {
  readonly relay: string;
  readonly source: RelayCandidateSource;
  readonly role: RelaySelectionRole;
  readonly selected: boolean;
  readonly clipped: boolean;
  readonly reason: string;
}

export interface RelaySelectionPlan {
  readonly readRelays: readonly string[];
  readonly writeRelays: readonly string[];
  readonly temporaryRelays: readonly string[];
  readonly diagnostics: readonly RelaySelectionDiagnostic[];
}

export interface RelaySelectionPlanInput {
  readonly intent: RelaySelectionIntent;
  readonly policy: RelaySelectionPolicyOptions;
  readonly candidates: readonly RelaySelectionCandidate[];
}

const CONSERVATIVE_DEFAULT_LIMIT = 4;
const STRICT_DEFAULT_LIMIT = Number.POSITIVE_INFINITY;

const STRICT_PRIORITIES: Record<RelayCandidateSource, number> = {
  'temporary-hint': 60,
  'nip65-read': 50,
  'nip65-write': 50,
  'durable-hint': 40,
  audience: 30,
  default: 10
};

const CONSERVATIVE_PRIORITIES: Record<RelayCandidateSource, number> = {
  'temporary-hint': 60,
  default: 50,
  'durable-hint': 40,
  'nip65-read': 30,
  'nip65-write': 30,
  audience: 20
};

const CONSERVATIVE_WRITE_PRIORITIES: Record<RelayCandidateSource, number> = {
  'temporary-hint': 60,
  'nip65-write': 60,
  default: 50,
  'durable-hint': 40,
  audience: 20,
  'nip65-read': 10
};

export function normalizeRelaySelectionPolicy(
  options: RelaySelectionPolicyOptions
): NormalizedRelaySelectionPolicy {
  const outbox = options.strategy !== 'default-only';
  const strict = options.strategy === 'strict-outbox';
  const defaultLimit = strict ? STRICT_DEFAULT_LIMIT : CONSERVATIVE_DEFAULT_LIMIT;

  return {
    strategy: options.strategy,
    maxReadRelays: normalizeLimit(options.maxReadRelays, defaultLimit),
    maxWriteRelays: normalizeLimit(options.maxWriteRelays, defaultLimit),
    maxTemporaryRelays: normalizeLimit(options.maxTemporaryRelays, defaultLimit),
    maxAudienceRelays: normalizeLimit(options.maxAudienceRelays, defaultLimit),
    includeDefaultFallback: options.includeDefaultFallback ?? true,
    allowTemporaryHints: options.allowTemporaryHints ?? outbox,
    includeDurableHints: options.includeDurableHints ?? outbox,
    includeAudienceRelays: options.includeAudienceRelays ?? outbox
  };
}

export function parseNip65RelayListTags(
  tags: readonly (readonly string[])[]
): Nip65RelayListEntry[] {
  const byRelay = new Map<string, Nip65RelayListEntry>();

  for (const tag of tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
    const relay = normalizeRelayUrl(tag[1]);
    if (!relay) continue;

    const marker = tag[2];
    const next: Nip65RelayListEntry =
      marker === 'read'
        ? { relay, read: true, write: false }
        : marker === 'write'
          ? { relay, read: false, write: true }
          : { relay, read: true, write: true };
    const existing = byRelay.get(relay);
    byRelay.set(relay, {
      relay,
      read: Boolean(existing?.read || next.read),
      write: Boolean(existing?.write || next.write)
    });
  }

  return [...byRelay.values()];
}

export function relayListEntriesToSelectionCandidates(
  entries: readonly Nip65RelayListEntry[]
): RelaySelectionCandidate[] {
  const candidates: RelaySelectionCandidate[] = [];
  for (const entry of entries) {
    if (entry.read) {
      candidates.push({ relay: entry.relay, source: 'nip65-read', role: 'read' });
    }
    if (entry.write) {
      candidates.push({ relay: entry.relay, source: 'nip65-write', role: 'write' });
    }
  }
  return candidates;
}

export function normalizeRelayUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
    url.hash = '';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function buildRelaySelectionPlan(input: RelaySelectionPlanInput): RelaySelectionPlan {
  const policy = normalizeRelaySelectionPolicy(input.policy);
  const allowed = normalizeAndFilterCandidates(input.candidates, policy);

  return {
    readRelays: selectRelays(allowed, policy, 'read'),
    writeRelays: selectRelays(allowed, policy, 'write'),
    temporaryRelays: selectRelays(allowed, policy, 'temporary'),
    diagnostics: buildDiagnostics(allowed, policy)
  };
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return STRICT_DEFAULT_LIMIT;
  return Math.max(0, Math.floor(value));
}

function normalizeAndFilterCandidates(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionCandidate[] {
  return candidates.flatMap((candidate) => {
    const relay = normalizeRelayUrl(candidate.relay);
    if (!relay) return [];
    if (
      policy.strategy === 'default-only' &&
      (candidate.source === 'nip65-read' || candidate.source === 'nip65-write')
    ) {
      return [];
    }
    if (candidate.source === 'temporary-hint' && !policy.allowTemporaryHints) return [];
    if (candidate.source === 'durable-hint' && !policy.includeDurableHints) return [];
    if (candidate.source === 'audience' && !policy.includeAudienceRelays) return [];
    if (candidate.source === 'default' && !policy.includeDefaultFallback) return [];
    return [{ ...candidate, relay }];
  });
}

function selectRelays(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy,
  role: RelaySelectionRole
): string[] {
  const byRelay = new Map<string, RelaySelectionCandidate>();
  for (const candidate of sortCandidates(candidates, policy)) {
    if (candidate.role !== role) continue;
    if (!byRelay.has(candidate.relay)) byRelay.set(candidate.relay, candidate);
  }

  return [...byRelay.keys()].slice(0, limitForRole(policy, role));
}

function buildDiagnostics(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionDiagnostic[] {
  const selectedByRole = new Map<RelaySelectionRole, Set<string>>([
    ['read', new Set(selectRelays(candidates, policy, 'read'))],
    ['write', new Set(selectRelays(candidates, policy, 'write'))],
    ['temporary', new Set(selectRelays(candidates, policy, 'temporary'))]
  ]);

  return sortCandidates(candidates, policy).map((candidate) => {
    const selected = selectedByRole.get(candidate.role)?.has(candidate.relay) ?? false;
    return {
      relay: candidate.relay,
      source: candidate.source,
      role: candidate.role,
      selected,
      clipped: !selected,
      reason: selected ? 'selected' : 'clipped-by-policy'
    };
  });
}

function sortCandidates(
  candidates: readonly RelaySelectionCandidate[],
  policy: NormalizedRelaySelectionPolicy
): RelaySelectionCandidate[] {
  return [...candidates].sort((left, right) => {
    const priority =
      sourcePriority(policy, right.source, right.role) -
      sourcePriority(policy, left.source, left.role);
    if (priority !== 0) return priority;
    const roleOrder = rolePriority(left.role) - rolePriority(right.role);
    if (roleOrder !== 0) return roleOrder;
    return left.relay.localeCompare(right.relay);
  });
}

function sourcePriority(
  policy: NormalizedRelaySelectionPolicy,
  source: RelayCandidateSource,
  role: RelaySelectionRole
): number {
  if (policy.strategy === 'strict-outbox') return STRICT_PRIORITIES[source];
  if (role === 'write') return CONSERVATIVE_WRITE_PRIORITIES[source];
  return CONSERVATIVE_PRIORITIES[source];
}

function rolePriority(role: RelaySelectionRole): number {
  if (role === 'read') return 0;
  if (role === 'write') return 1;
  return 2;
}

function limitForRole(policy: NormalizedRelaySelectionPolicy, role: RelaySelectionRole): number {
  if (role === 'read') return policy.maxReadRelays;
  if (role === 'write') return policy.maxWriteRelays;
  return policy.maxTemporaryRelays;
}
