import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIP28_CHANNEL_CREATE_KIND = 40;
export const NIP28_CHANNEL_METADATA_KIND = 41;
export const NIP28_CHANNEL_MESSAGE_KIND = 42;
export const NIP28_HIDE_MESSAGE_KIND = 43;
export const NIP28_MUTE_USER_KIND = 44;
export const NIP28_CHANNEL_KINDS = [
  NIP28_CHANNEL_CREATE_KIND,
  NIP28_CHANNEL_METADATA_KIND,
  NIP28_CHANNEL_MESSAGE_KIND,
  NIP28_HIDE_MESSAGE_KIND,
  NIP28_MUTE_USER_KIND
] as const;
export const NIP28_ROOT_MARKER = 'root';
export const NIP28_REPLY_MARKER = 'reply';

export type Nip28ChannelKind = (typeof NIP28_CHANNEL_KINDS)[number];
export type Nip28JsonPrimitive = string | number | boolean | null;
export type Nip28JsonValue =
  | Nip28JsonPrimitive
  | readonly Nip28JsonValue[]
  | { readonly [key: string]: Nip28JsonValue };

export interface Nip28ChannelMetadata {
  readonly name?: string;
  readonly about?: string;
  readonly picture?: string;
  readonly relays?: readonly string[];
  readonly [key: string]: Nip28JsonValue | undefined;
}

export interface Nip28ChannelReferenceInput {
  readonly channelId: string;
  readonly relayHint?: string | null;
}

export interface Nip28MessageReplyInput {
  readonly eventId: string;
  readonly relayHint?: string | null;
  readonly pubkey?: string | null;
  readonly pubkeyRelayHint?: string | null;
}

export interface Nip28EventReference {
  readonly eventId: string;
  readonly relayHint: string | null;
  readonly marker: string | null;
  readonly tag: readonly string[];
}

export interface Nip28PubkeyReference {
  readonly pubkey: string;
  readonly relayHint: string | null;
  readonly tag: readonly string[];
}

export interface BuildNip28ChannelCreateInput {
  readonly metadata: Nip28ChannelMetadata;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip28ChannelMetadataInput {
  readonly channelId: string;
  readonly relayHint?: string | null;
  readonly metadata: Nip28ChannelMetadata;
  readonly categories?: readonly string[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip28ChannelMessageInput {
  readonly channelId: string;
  readonly content: string;
  readonly relayHint?: string | null;
  readonly reply?: Nip28MessageReplyInput | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip28HideMessageInput {
  readonly eventId: string;
  readonly reason?: string | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip28MuteUserInput {
  readonly pubkey: string;
  readonly reason?: string | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip28ChannelMetadataSnapshot {
  readonly kind: typeof NIP28_CHANNEL_CREATE_KIND | typeof NIP28_CHANNEL_METADATA_KIND;
  readonly metadata: Nip28ChannelMetadata;
  readonly channel: Nip28EventReference | null;
  readonly categories: readonly string[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip28ChannelMessageSnapshot {
  readonly kind: typeof NIP28_CHANNEL_MESSAGE_KIND;
  readonly content: string;
  readonly channel: Nip28EventReference | null;
  readonly reply: Nip28EventReference | null;
  readonly pubkeys: readonly Nip28PubkeyReference[];
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip28HideMessageSnapshot {
  readonly kind: typeof NIP28_HIDE_MESSAGE_KIND;
  readonly eventId: string;
  readonly reason: string | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip28MuteUserSnapshot {
  readonly kind: typeof NIP28_MUTE_USER_KIND;
  readonly mutedPubkey: string;
  readonly reason: string | null;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface BuildNip28ChannelMessageFilterInput {
  readonly channelId?: string | null;
  readonly authors?: readonly string[];
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

export interface BuildNip28ChannelMetadataFilterInput {
  readonly channelId?: string | null;
  readonly categories?: readonly string[];
  readonly authors?: readonly string[];
  readonly limit?: number | null;
}

const STRUCTURED_METADATA_TAGS = new Set(['e', 't']);
const STRUCTURED_MESSAGE_TAGS = new Set(['e', 'p']);
const STRUCTURED_HIDE_TAGS = new Set(['e']);
const STRUCTURED_MUTE_TAGS = new Set(['p']);
const HEX_64 = /^[0-9a-f]{64}$/i;

export function isNip28ChannelKind(kind: number): kind is Nip28ChannelKind {
  return (NIP28_CHANNEL_KINDS as readonly number[]).includes(kind);
}

export function buildNip28ChannelCreateEvent(input: BuildNip28ChannelCreateInput): EventParameters {
  return {
    kind: NIP28_CHANNEL_CREATE_KIND,
    content: stringifyNip28ChannelMetadata(input.metadata),
    tags: copyTags(input.tags ?? [])
  };
}

export function buildNip28ChannelMetadataEvent(
  input: BuildNip28ChannelMetadataInput
): EventParameters {
  return {
    kind: NIP28_CHANNEL_METADATA_KIND,
    content: stringifyNip28ChannelMetadata(input.metadata),
    tags: [
      buildNip28RootTag({
        channelId: input.channelId,
        relayHint: input.relayHint
      }),
      ...(input.categories ?? []).map(buildNip28CategoryTag),
      ...copyCustomTags(input.tags ?? [], STRUCTURED_METADATA_TAGS)
    ]
  };
}

export function buildNip28ChannelMessageEvent(
  input: BuildNip28ChannelMessageInput
): EventParameters {
  const reply = input.reply ?? null;
  return {
    kind: NIP28_CHANNEL_MESSAGE_KIND,
    content: normalizeNonEmpty(input.content, 'message content'),
    tags: [
      buildNip28RootTag({
        channelId: input.channelId,
        relayHint: input.relayHint
      }),
      ...(reply ? [buildNip28ReplyTag(reply)] : []),
      ...(reply?.pubkey ? [buildNip28PubkeyTag(reply.pubkey, reply.pubkeyRelayHint)] : []),
      ...copyCustomTags(input.tags ?? [], STRUCTURED_MESSAGE_TAGS)
    ]
  };
}

export function buildNip28HideMessageEvent(input: BuildNip28HideMessageInput): EventParameters {
  return {
    kind: NIP28_HIDE_MESSAGE_KIND,
    content: stringifyNip28Reason(input.reason),
    tags: [
      ['e', normalizeHex64(input.eventId, 'message event id')],
      ...copyCustomTags(input.tags ?? [], STRUCTURED_HIDE_TAGS)
    ]
  };
}

export function buildNip28MuteUserEvent(input: BuildNip28MuteUserInput): EventParameters {
  return {
    kind: NIP28_MUTE_USER_KIND,
    content: stringifyNip28Reason(input.reason),
    tags: [
      ['p', normalizeHex64(input.pubkey, 'muted pubkey')],
      ...copyCustomTags(input.tags ?? [], STRUCTURED_MUTE_TAGS)
    ]
  };
}

export function buildNip28RootTag(input: Nip28ChannelReferenceInput): string[] {
  return buildMarkedEventTag(input.channelId, input.relayHint, NIP28_ROOT_MARKER, 'channel id');
}

export function buildNip28ReplyTag(input: Nip28MessageReplyInput): string[] {
  return buildMarkedEventTag(input.eventId, input.relayHint, NIP28_REPLY_MARKER, 'reply event id');
}

export function buildNip28PubkeyTag(pubkey: string, relayHint?: string | null): string[] {
  const normalized = normalizeHex64(pubkey, 'reply pubkey');
  const relay = relayHint?.trim();
  return relay ? ['p', normalized, relay] : ['p', normalized];
}

export function buildNip28CategoryTag(category: string): string[] {
  return ['t', normalizeNonEmpty(category, 'category')];
}

export function buildNip28ChannelMessageFilter(
  input: BuildNip28ChannelMessageFilterInput = {}
): Filter {
  const filter: Filter = { kinds: [NIP28_CHANNEL_MESSAGE_KIND] };
  if (input.channelId) {
    filter['#e'] = [normalizeHex64(input.channelId, 'channel id')];
  }
  applyCommonFilterFields(filter, input);
  return filter;
}

export function buildNip28ChannelMetadataFilter(
  input: BuildNip28ChannelMetadataFilterInput = {}
): Filter {
  const filter: Filter = {
    kinds: [NIP28_CHANNEL_CREATE_KIND, NIP28_CHANNEL_METADATA_KIND]
  };
  if (input.channelId) {
    filter['#e'] = [normalizeHex64(input.channelId, 'channel id')];
  }
  if (input.categories?.length) {
    filter['#t'] = input.categories.map((category) => normalizeNonEmpty(category, 'category'));
  }
  if (input.authors?.length) {
    filter.authors = input.authors.map((author) => normalizeHex64(author, 'author pubkey'));
  }
  if (input.limit !== undefined && input.limit !== null) {
    filter.limit = normalizePositiveInteger(input.limit, 'filter limit');
  }
  return filter;
}

export function stringifyNip28ChannelMetadata(metadata: Nip28ChannelMetadata): string {
  return JSON.stringify(normalizeNip28ChannelMetadata(metadata));
}

export function parseNip28ChannelMetadataJson(content: string): Nip28ChannelMetadata | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isPlainRecord(parsed)) return null;
    const metadata: Record<string, Nip28JsonValue> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      if (key === 'name' || key === 'about' || key === 'picture') {
        if (typeof value === 'string' && value.trim()) metadata[key] = value;
        continue;
      }
      if (key === 'relays') {
        if (Array.isArray(value)) {
          metadata.relays = value.flatMap((relay) =>
            typeof relay === 'string' && relay.trim() ? [relay.trim()] : []
          );
        }
        continue;
      }
      if (isJsonValue(value)) metadata[key] = value;
    }
    return metadata;
  } catch {
    return null;
  }
}

export function parseNip28ChannelMetadataEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip28ChannelMetadataSnapshot | null {
  if (event.kind !== NIP28_CHANNEL_CREATE_KIND && event.kind !== NIP28_CHANNEL_METADATA_KIND) {
    return null;
  }
  const metadata = parseNip28ChannelMetadataJson(event.content);
  if (!metadata) return null;
  const root = parseNip28EventReferences(event.tags).find(
    (reference) => reference.marker === NIP28_ROOT_MARKER
  );
  return {
    kind: event.kind,
    metadata,
    channel: root ?? null,
    categories: parseNip28Categories(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_METADATA_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip28ChannelMessageEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip28ChannelMessageSnapshot | null {
  if (event.kind !== NIP28_CHANNEL_MESSAGE_KIND) return null;
  if (!event.content.trim()) return null;
  const refs = parseNip28EventReferences(event.tags);
  const channel = refs.find((reference) => reference.marker === NIP28_ROOT_MARKER) ?? null;
  if (!channel) return null;
  return {
    kind: NIP28_CHANNEL_MESSAGE_KIND,
    content: event.content,
    channel,
    reply: refs.find((reference) => reference.marker === NIP28_REPLY_MARKER) ?? null,
    pubkeys: parseNip28PubkeyReferences(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_MESSAGE_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip28HideMessageEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip28HideMessageSnapshot | null {
  if (event.kind !== NIP28_HIDE_MESSAGE_KIND) return null;
  const eventId = event.tags.find((tag) => tag[0] === 'e')?.[1]?.trim();
  if (!eventId) return null;
  return {
    kind: NIP28_HIDE_MESSAGE_KIND,
    eventId,
    reason: parseNip28Reason(event.content),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_HIDE_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip28MuteUserEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip28MuteUserSnapshot | null {
  if (event.kind !== NIP28_MUTE_USER_KIND) return null;
  const mutedPubkey = event.tags.find((tag) => tag[0] === 'p')?.[1]?.trim();
  if (!mutedPubkey) return null;
  return {
    kind: NIP28_MUTE_USER_KIND,
    mutedPubkey,
    reason: parseNip28Reason(event.content),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_MUTE_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip28EventReferences(
  tags: readonly (readonly string[])[]
): Nip28EventReference[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'e') return [];
    const eventId = tag[1]?.trim();
    if (!eventId) return [];
    return [
      {
        eventId,
        relayHint: tag[2]?.trim() || null,
        marker: tag[3]?.trim() || null,
        tag: [...tag]
      }
    ];
  });
}

export function parseNip28PubkeyReferences(
  tags: readonly (readonly string[])[]
): Nip28PubkeyReference[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'p') return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    return [{ pubkey, relayHint: tag[2]?.trim() || null, tag: [...tag] }];
  });
}

export function parseNip28Categories(tags: readonly (readonly string[])[]): string[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 't') return [];
    const value = tag[1]?.trim();
    return value ? [value] : [];
  });
}

function buildMarkedEventTag(
  eventId: string,
  relayHint: string | null | undefined,
  marker: string,
  label: string
): string[] {
  return ['e', normalizeHex64(eventId, label), relayHint?.trim() ?? '', marker];
}

function normalizeNip28ChannelMetadata(metadata: Nip28ChannelMetadata): Nip28ChannelMetadata {
  const normalized: Record<string, Nip28JsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (key === 'name' || key === 'about' || key === 'picture') {
      if (typeof value !== 'string') {
        throw new Error(`NIP-28 ${key} must be a string`);
      }
      const trimmed = value.trim();
      if (trimmed) normalized[key] = trimmed;
      continue;
    }
    if (key === 'relays') {
      if (!Array.isArray(value)) {
        throw new Error('NIP-28 relays must be an array');
      }
      normalized.relays = value.map((relay) => normalizeRelayUrl(String(relay)));
      continue;
    }
    normalized[key] = assertJsonValue(value);
  }
  return normalized;
}

function stringifyNip28Reason(reason: string | null | undefined): string {
  const normalized = reason?.trim();
  return normalized ? JSON.stringify({ reason: normalized }) : '';
}

function parseNip28Reason(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isPlainRecord(parsed) && typeof parsed.reason === 'string' && parsed.reason.trim()) {
      return parsed.reason;
    }
    return null;
  } catch {
    return null;
  }
}

function copyCustomTags(
  tags: readonly (readonly string[])[],
  structuredTags: ReadonlySet<string>
): string[][] {
  return copyTags(tags).filter((tag) => !structuredTags.has(tag[0]));
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function applyCommonFilterFields(
  filter: Filter,
  input: Pick<BuildNip28ChannelMessageFilterInput, 'authors' | 'since' | 'until' | 'limit'>
): void {
  if (input.authors?.length) {
    filter.authors = input.authors.map((author) => normalizeHex64(author, 'author pubkey'));
  }
  if (input.since !== undefined && input.since !== null) {
    filter.since = normalizeTimestamp(input.since, 'filter since');
  }
  if (input.until !== undefined && input.until !== null) {
    filter.until = normalizeTimestamp(input.until, 'filter until');
  }
  if (input.limit !== undefined && input.limit !== null) {
    filter.limit = normalizePositiveInteger(input.limit, 'filter limit');
  }
}

function normalizeHex64(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HEX_64.test(normalized)) {
    throw new Error(`NIP-28 ${label} must be 32-byte hex`);
  }
  return normalized;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-28 ${label} must be non-empty`);
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-28 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-28 ${label} must be a positive safe integer`);
  }
  return value;
}

function normalizeRelayUrl(value: string): string {
  const normalized = normalizeNonEmpty(value, 'relay URL');
  if (!/^wss?:\/\//i.test(normalized)) {
    throw new Error('NIP-28 relay URL must use ws:// or wss://');
  }
  return normalized;
}

function assertJsonValue(value: unknown): Nip28JsonValue {
  if (isJsonValue(value)) return value;
  throw new Error('NIP-28 metadata values must be JSON serializable');
}

function isJsonValue(value: unknown): value is Nip28JsonValue {
  if (value === null) return true;
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isPlainRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
