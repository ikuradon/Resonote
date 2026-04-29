import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIP88_POLL_KIND = 1068;
export const NIP88_RESPONSE_KIND = 1018;
export const NIP88_OPTION_TAG = 'option';
export const NIP88_RESPONSE_TAG = 'response';
export const NIP88_RELAY_TAG = 'relay';
export const NIP88_POLL_TYPE_TAG = 'polltype';
export const NIP88_ENDS_AT_TAG = 'endsAt';
export const NIP88_POLL_TYPES = ['singlechoice', 'multiplechoice'] as const;
export const NIP88_DEFAULT_POLL_TYPE = 'singlechoice';

export type Nip88PollType = (typeof NIP88_POLL_TYPES)[number];

export interface Nip88OptionInput {
  readonly id: string;
  readonly label: string;
}

export interface Nip88Option {
  readonly id: string;
  readonly label: string;
}

export interface BuildNip88PollInput {
  readonly label: string;
  readonly options: readonly Nip88OptionInput[];
  readonly relays?: readonly string[];
  readonly pollType?: Nip88PollType | null;
  readonly endsAt?: number | string | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip88PollSnapshot {
  readonly kind: typeof NIP88_POLL_KIND;
  readonly label: string;
  readonly options: readonly Nip88Option[];
  readonly relays: readonly string[];
  readonly pollType: Nip88PollType;
  readonly endsAt: number | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface BuildNip88ResponseInput {
  readonly pollEventId: string;
  readonly optionIds: readonly string[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip88ResponseSnapshot {
  readonly kind: typeof NIP88_RESPONSE_KIND;
  readonly pollEventId: string;
  readonly optionIds: readonly string[];
  readonly content: string;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip88ResponseSelectionOptions {
  readonly pollEventId?: string | null;
  readonly since?: number | null;
  readonly until?: number | null;
}

export interface Nip88PollTally {
  readonly totals: Readonly<Record<string, number>>;
  readonly totalRespondents: number;
  readonly responses: readonly Nip88ResponseSnapshot[];
}

const POLL_TYPE_SET = new Set<string>(NIP88_POLL_TYPES);
const POLL_STRUCTURED_TAGS = new Set([
  NIP88_OPTION_TAG,
  NIP88_RELAY_TAG,
  NIP88_POLL_TYPE_TAG,
  NIP88_ENDS_AT_TAG
]);
const RESPONSE_STRUCTURED_TAGS = new Set(['e', NIP88_RESPONSE_TAG]);
const OPTION_ID_PATTERN = /^[A-Za-z0-9]+$/;

export function isNip88PollType(value: string): value is Nip88PollType {
  return POLL_TYPE_SET.has(value);
}

export function buildNip88Poll(input: BuildNip88PollInput): EventParameters {
  if (input.options.length === 0) {
    throw new Error('NIP-88 poll requires at least one option');
  }

  const tags: string[][] = input.options.map(buildNip88OptionTag);
  assertUniqueOptionIds(tags.map((tag) => tag[1]));
  tags.push(...(input.relays ?? []).map(buildNip88RelayTag));
  if (input.pollType) tags.push(buildNip88PollTypeTag(input.pollType));
  if (input.endsAt !== undefined && input.endsAt !== null) {
    tags.push(buildNip88EndsAtTag(input.endsAt));
  }
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !POLL_STRUCTURED_TAGS.has(tag[0])));

  return {
    kind: NIP88_POLL_KIND,
    content: normalizeNonEmpty(input.label, 'poll label'),
    tags
  };
}

export function buildNip88OptionTag(input: Nip88OptionInput): string[] {
  return [
    NIP88_OPTION_TAG,
    normalizeOptionId(input.id),
    normalizeNonEmpty(input.label, 'option label')
  ];
}

export function buildNip88RelayTag(relay: string): string[] {
  return [NIP88_RELAY_TAG, normalizeNonEmpty(relay, 'relay URL')];
}

export function buildNip88PollTypeTag(pollType: Nip88PollType): string[] {
  assertPollType(pollType);
  return [NIP88_POLL_TYPE_TAG, pollType];
}

export function buildNip88EndsAtTag(endsAt: number | string): string[] {
  return [NIP88_ENDS_AT_TAG, String(normalizeTimestamp(endsAt, 'poll end timestamp'))];
}

export function buildNip88Response(input: BuildNip88ResponseInput): EventParameters {
  if (input.optionIds.length === 0) {
    throw new Error('NIP-88 response requires at least one option id');
  }
  return {
    kind: NIP88_RESPONSE_KIND,
    content: input.content ?? '',
    tags: [
      ['e', normalizeNonEmpty(input.pollEventId, 'poll event id')],
      ...input.optionIds.map((optionId) => [NIP88_RESPONSE_TAG, normalizeOptionId(optionId)]),
      ...copyTags(input.tags ?? []).filter((tag) => !RESPONSE_STRUCTURED_TAGS.has(tag[0]))
    ]
  };
}

export function parseNip88Poll(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip88PollSnapshot | null {
  if (event.kind !== NIP88_POLL_KIND) return null;
  const options = parseNip88Options(event.tags);
  if (options.length === 0) return null;
  const pollType = parsePollType(event.tags);
  return {
    kind: NIP88_POLL_KIND,
    label: event.content,
    options,
    relays: parseTagValues(event.tags, NIP88_RELAY_TAG),
    pollType,
    endsAt: parseTimestamp(firstTagValue(event.tags, NIP88_ENDS_AT_TAG)),
    customTags: copyTags(event.tags).filter((tag) => !POLL_STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip88Options(tags: readonly (readonly string[])[]): Nip88Option[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== NIP88_OPTION_TAG) return [];
    const id = tag[1]?.trim();
    const label = tag[2]?.trim();
    if (!id || !label || !OPTION_ID_PATTERN.test(id)) return [];
    return [{ id, label }];
  });
}

export function parseNip88Response(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip88ResponseSnapshot | null {
  if (event.kind !== NIP88_RESPONSE_KIND) return null;
  const pollEventId = firstTagValue(event.tags, 'e');
  if (!pollEventId) return null;
  const optionIds = parseTagValues(event.tags, NIP88_RESPONSE_TAG).filter((optionId) =>
    OPTION_ID_PATTERN.test(optionId)
  );
  if (optionIds.length === 0) return null;
  return {
    kind: NIP88_RESPONSE_KIND,
    pollEventId,
    optionIds,
    content: event.content,
    customTags: copyTags(event.tags).filter((tag) => !RESPONSE_STRUCTURED_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function buildNip88ResponseFilter(input: {
  readonly pollEventId: string;
  readonly authors?: readonly string[];
  readonly until?: number | null;
}): Filter {
  const filter: Filter = {
    kinds: [NIP88_RESPONSE_KIND],
    '#e': [normalizeNonEmpty(input.pollEventId, 'poll event id')]
  };
  if (input.authors?.length) {
    filter.authors = input.authors.map((author) => normalizeNonEmpty(author, 'author pubkey'));
  }
  if (input.until !== undefined && input.until !== null) {
    filter.until = normalizeTimestamp(input.until, 'response query until');
  }
  return filter;
}

export function normalizeNip88ResponseOptionIds(
  optionIds: readonly string[],
  pollType: Nip88PollType = NIP88_DEFAULT_POLL_TYPE
): string[] {
  assertPollType(pollType);
  const normalized = optionIds.map(normalizeOptionId);
  if (pollType === 'singlechoice') return normalized.slice(0, 1);
  return [...new Set(normalized)];
}

export function selectNip88LatestResponsesByPubkey(
  events: readonly (Pick<NostrEvent, 'kind' | 'tags' | 'content' | 'pubkey' | 'created_at'> &
    Partial<Pick<NostrEvent, 'id'>>)[],
  options: Nip88ResponseSelectionOptions = {}
): Nip88ResponseSnapshot[] {
  const latest = new Map<string, Nip88ResponseSnapshot>();
  for (const event of events) {
    if (!event.pubkey || !Number.isSafeInteger(event.created_at)) continue;
    if (options.since !== undefined && options.since !== null && event.created_at < options.since) {
      continue;
    }
    if (options.until !== undefined && options.until !== null && event.created_at > options.until) {
      continue;
    }
    const response = parseNip88Response(event);
    if (!response) continue;
    if (options.pollEventId && response.pollEventId !== options.pollEventId) continue;
    const previous = latest.get(event.pubkey);
    if (!previous || (response.createdAt ?? 0) > (previous.createdAt ?? 0)) {
      latest.set(event.pubkey, response);
    }
  }
  return [...latest.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

export function tallyNip88Responses(
  events: readonly (Pick<NostrEvent, 'kind' | 'tags' | 'content' | 'pubkey' | 'created_at'> &
    Partial<Pick<NostrEvent, 'id'>>)[],
  input: Nip88ResponseSelectionOptions & {
    readonly pollType?: Nip88PollType;
    readonly optionIds?: readonly string[];
  } = {}
): Nip88PollTally {
  const responses = selectNip88LatestResponsesByPubkey(events, input);
  const totals: Record<string, number> = {};
  for (const optionId of input.optionIds ?? []) {
    totals[normalizeOptionId(optionId)] = 0;
  }
  for (const response of responses) {
    for (const optionId of normalizeNip88ResponseOptionIds(response.optionIds, input.pollType)) {
      totals[optionId] = (totals[optionId] ?? 0) + 1;
    }
  }
  return {
    totals,
    totalRespondents: responses.length,
    responses
  };
}

function parsePollType(tags: readonly (readonly string[])[]): Nip88PollType {
  const value = firstTagValue(tags, NIP88_POLL_TYPE_TAG);
  return value && isNip88PollType(value) ? value : NIP88_DEFAULT_POLL_TYPE;
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeTimestamp(value: number | string, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`NIP-88 ${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function assertPollType(value: string): asserts value is Nip88PollType {
  if (!isNip88PollType(value)) {
    throw new Error(`NIP-88 unsupported poll type: ${value}`);
  }
}

function assertUniqueOptionIds(optionIds: readonly string[]): void {
  const seen = new Set<string>();
  for (const optionId of optionIds) {
    if (seen.has(optionId)) throw new Error(`NIP-88 duplicate option id: ${optionId}`);
    seen.add(optionId);
  }
}

function normalizeOptionId(value: string): string {
  const normalized = normalizeNonEmpty(value, 'option id');
  if (!OPTION_ID_PATTERN.test(normalized)) {
    throw new Error(`NIP-88 option id must be alphanumeric: ${value}`);
  }
  return normalized;
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  return parseTagValues(tags, tagName)[0] ?? null;
}

function parseTagValues(tags: readonly (readonly string[])[], tagName: string): string[] {
  return tags.flatMap((tag) => {
    const value = tag[0] === tagName ? tag[1]?.trim() : null;
    return value ? [value] : [];
  });
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-88 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
