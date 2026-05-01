import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP53_LIVE_STREAM_KIND = 30311;
export const NIP53_LIVE_CHAT_KIND = 1311;
export const NIP53_MEETING_SPACE_KIND = 30312;
export const NIP53_MEETING_ROOM_KIND = 30313;
export const NIP53_ROOM_PRESENCE_KIND = 10312;
export const NIP53_ACTIVITY_STATUSES = ['planned', 'live', 'ended'] as const;
export const NIP53_SPACE_STATUSES = ['open', 'private', 'closed'] as const;

export type Nip53ActivityStatus = (typeof NIP53_ACTIVITY_STATUSES)[number];
export type Nip53SpaceStatus = (typeof NIP53_SPACE_STATUSES)[number];
export type Nip53AddressKind =
  | typeof NIP53_LIVE_STREAM_KIND
  | typeof NIP53_MEETING_SPACE_KIND
  | typeof NIP53_MEETING_ROOM_KIND;

export interface Nip53AddressInput {
  readonly kind: Nip53AddressKind;
  readonly pubkey: string;
  readonly identifier: string;
  readonly relayHint?: string | null;
  readonly marker?: string | null;
}

export interface Nip53Address {
  readonly kind: Nip53AddressKind;
  readonly pubkey: string;
  readonly identifier: string;
  readonly value: string;
  readonly relayHint: string | null;
  readonly marker: string | null;
}

export interface Nip53ParticipantInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
  readonly role?: string | null;
  readonly proof?: string | null;
}

export interface Nip53Participant {
  readonly pubkey: string;
  readonly relayHint: string | null;
  readonly role: string | null;
  readonly proof: string | null;
}

export interface BuildNip53LiveStreamInput {
  readonly identifier: string;
  readonly content?: string;
  readonly title?: string | null;
  readonly summary?: string | null;
  readonly image?: string | null;
  readonly hashtags?: readonly string[];
  readonly streamingUrl?: string | null;
  readonly recordingUrl?: string | null;
  readonly starts?: number | null;
  readonly ends?: number | null;
  readonly status?: Nip53ActivityStatus | null;
  readonly currentParticipants?: number | null;
  readonly totalParticipants?: number | null;
  readonly participants?: readonly Nip53ParticipantInput[];
  readonly relays?: readonly string[];
  readonly pinnedEventIds?: readonly string[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip53LiveChatInput {
  readonly activity: Nip53AddressInput;
  readonly content: string;
  readonly parentEventId?: string | null;
  readonly parentRelayHint?: string | null;
  readonly quoteTags?: readonly (readonly string[])[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip53MeetingSpaceInput {
  readonly identifier: string;
  readonly room: string;
  readonly status: Nip53SpaceStatus;
  readonly serviceUrl: string;
  readonly content?: string;
  readonly summary?: string | null;
  readonly image?: string | null;
  readonly endpointUrl?: string | null;
  readonly hashtags?: readonly string[];
  readonly providers: readonly Nip53ParticipantInput[];
  readonly relays?: readonly string[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip53MeetingRoomInput {
  readonly identifier: string;
  readonly parentSpace: Nip53AddressInput;
  readonly title: string;
  readonly starts: number;
  readonly status: Nip53ActivityStatus;
  readonly content?: string;
  readonly summary?: string | null;
  readonly image?: string | null;
  readonly ends?: number | null;
  readonly currentParticipants?: number | null;
  readonly totalParticipants?: number | null;
  readonly participants?: readonly Nip53ParticipantInput[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip53RoomPresenceInput {
  readonly room: Nip53AddressInput;
  readonly handRaised?: boolean | null;
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip53LiveStreamSnapshot {
  readonly kind: typeof NIP53_LIVE_STREAM_KIND;
  readonly identifier: string;
  readonly content: string;
  readonly title: string | null;
  readonly summary: string | null;
  readonly image: string | null;
  readonly hashtags: readonly string[];
  readonly streamingUrl: string | null;
  readonly recordingUrl: string | null;
  readonly starts: number | null;
  readonly ends: number | null;
  readonly status: Nip53ActivityStatus | null;
  readonly currentParticipants: number | null;
  readonly totalParticipants: number | null;
  readonly participants: readonly Nip53Participant[];
  readonly relays: readonly string[];
  readonly pinnedEventIds: readonly string[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip53LiveChatSnapshot {
  readonly kind: typeof NIP53_LIVE_CHAT_KIND;
  readonly content: string;
  readonly activity: Nip53Address;
  readonly parentEventId: string | null;
  readonly parentRelayHint: string | null;
  readonly quoteTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip53MeetingSpaceSnapshot {
  readonly kind: typeof NIP53_MEETING_SPACE_KIND;
  readonly identifier: string;
  readonly room: string;
  readonly status: Nip53SpaceStatus;
  readonly serviceUrl: string;
  readonly content: string;
  readonly summary: string | null;
  readonly image: string | null;
  readonly endpointUrl: string | null;
  readonly hashtags: readonly string[];
  readonly providers: readonly Nip53Participant[];
  readonly relays: readonly string[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip53MeetingRoomSnapshot {
  readonly kind: typeof NIP53_MEETING_ROOM_KIND;
  readonly identifier: string;
  readonly parentSpace: Nip53Address;
  readonly title: string;
  readonly starts: number;
  readonly status: Nip53ActivityStatus;
  readonly content: string;
  readonly summary: string | null;
  readonly image: string | null;
  readonly ends: number | null;
  readonly currentParticipants: number | null;
  readonly totalParticipants: number | null;
  readonly participants: readonly Nip53Participant[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip53RoomPresenceSnapshot {
  readonly kind: typeof NIP53_ROOM_PRESENCE_KIND;
  readonly room: Nip53Address;
  readonly handRaised: boolean;
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

const ACTIVITY_STATUS_SET = new Set<string>(NIP53_ACTIVITY_STATUSES);
const SPACE_STATUS_SET = new Set<string>(NIP53_SPACE_STATUSES);
const LIVE_STREAM_TAGS = new Set([
  'd',
  'title',
  'summary',
  'image',
  't',
  'streaming',
  'recording',
  'starts',
  'ends',
  'status',
  'current_participants',
  'total_participants',
  'p',
  'relays',
  'pinned'
]);
const LIVE_CHAT_TAGS = new Set(['a', 'e', 'q']);
const MEETING_SPACE_TAGS = new Set([
  'd',
  'room',
  'summary',
  'image',
  'status',
  'service',
  'endpoint',
  't',
  'p',
  'relays'
]);
const MEETING_ROOM_TAGS = new Set([
  'd',
  'a',
  'title',
  'summary',
  'image',
  'starts',
  'ends',
  'status',
  'total_participants',
  'current_participants',
  'p'
]);
const ROOM_PRESENCE_TAGS = new Set(['a', 'hand']);

export function buildNip53LiveStream(input: BuildNip53LiveStreamInput): EventParameters {
  if (input.starts !== undefined && input.starts !== null) assertTimestamp(input.starts, 'starts');
  if (input.ends !== undefined && input.ends !== null) assertTimestamp(input.ends, 'ends');
  if (input.starts != null && input.ends != null && input.starts > input.ends) {
    throw new Error('NIP-53 live stream ends must be greater than or equal to starts');
  }
  if (input.status && !isNip53ActivityStatus(input.status)) {
    throw new Error(`Unsupported NIP-53 activity status: ${input.status}`);
  }

  const tags: string[][] = [['d', normalizeNonEmpty(input.identifier, 'live stream identifier')]];
  appendOptionalTag(tags, 'title', input.title);
  appendOptionalTag(tags, 'summary', input.summary);
  appendOptionalTag(tags, 'image', input.image);
  for (const hashtag of normalizeStringList(input.hashtags ?? [])) tags.push(['t', hashtag]);
  appendOptionalTag(tags, 'streaming', input.streamingUrl);
  appendOptionalTag(tags, 'recording', input.recordingUrl);
  appendOptionalNumberTag(tags, 'starts', input.starts);
  appendOptionalNumberTag(tags, 'ends', input.ends);
  appendOptionalTag(tags, 'status', input.status);
  appendOptionalCountTag(tags, 'current_participants', input.currentParticipants);
  appendOptionalCountTag(tags, 'total_participants', input.totalParticipants);
  tags.push(...(input.participants ?? []).map(buildNip53ParticipantTag));
  appendRelaysTag(tags, input.relays);
  for (const pinned of normalizeStringList(input.pinnedEventIds ?? []))
    tags.push(['pinned', pinned]);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !LIVE_STREAM_TAGS.has(tag[0])));

  return {
    kind: NIP53_LIVE_STREAM_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip53LiveChat(input: BuildNip53LiveChatInput): EventParameters {
  const tags: string[][] = [
    buildNip53AddressTag(
      assertAddressKind(input.activity, NIP53_LIVE_STREAM_KIND, 'live chat activity')
    )
  ];
  const parentEventId = input.parentEventId?.trim();
  if (parentEventId) {
    const relay = input.parentRelayHint?.trim();
    tags.push(relay ? ['e', parentEventId, relay] : ['e', parentEventId]);
  }
  tags.push(...copyTags(input.quoteTags ?? []).filter((tag) => tag[0] === 'q'));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !LIVE_CHAT_TAGS.has(tag[0])));

  return {
    kind: NIP53_LIVE_CHAT_KIND,
    content: input.content,
    tags
  };
}

export function buildNip53MeetingSpace(input: BuildNip53MeetingSpaceInput): EventParameters {
  if (!isNip53SpaceStatus(input.status)) {
    throw new Error(`Unsupported NIP-53 meeting space status: ${input.status}`);
  }
  if (input.providers.length === 0) {
    throw new Error('NIP-53 meeting space requires at least one provider');
  }

  const tags: string[][] = [
    ['d', normalizeNonEmpty(input.identifier, 'meeting space identifier')],
    ['room', normalizeNonEmpty(input.room, 'meeting space room')],
    ['status', input.status],
    ['service', normalizeNonEmpty(input.serviceUrl, 'meeting space service URL')]
  ];
  appendOptionalTag(tags, 'summary', input.summary);
  appendOptionalTag(tags, 'image', input.image);
  appendOptionalTag(tags, 'endpoint', input.endpointUrl);
  for (const hashtag of normalizeStringList(input.hashtags ?? [])) tags.push(['t', hashtag]);
  tags.push(...input.providers.map(buildNip53ParticipantTag));
  appendRelaysTag(tags, input.relays);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !MEETING_SPACE_TAGS.has(tag[0])));

  return {
    kind: NIP53_MEETING_SPACE_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip53MeetingRoom(input: BuildNip53MeetingRoomInput): EventParameters {
  assertTimestamp(input.starts, 'starts');
  if (input.ends !== undefined && input.ends !== null) {
    assertTimestamp(input.ends, 'ends');
    if (input.starts > input.ends) {
      throw new Error('NIP-53 meeting room ends must be greater than or equal to starts');
    }
  }
  if (!isNip53ActivityStatus(input.status)) {
    throw new Error(`Unsupported NIP-53 activity status: ${input.status}`);
  }

  const tags: string[][] = [
    ['d', normalizeNonEmpty(input.identifier, 'meeting room identifier')],
    buildNip53AddressTag(
      assertAddressKind(input.parentSpace, NIP53_MEETING_SPACE_KIND, 'meeting room parent space')
    ),
    ['title', normalizeNonEmpty(input.title, 'meeting room title')],
    ['starts', String(input.starts)],
    ['status', input.status]
  ];
  appendOptionalTag(tags, 'summary', input.summary);
  appendOptionalTag(tags, 'image', input.image);
  appendOptionalNumberTag(tags, 'ends', input.ends);
  appendOptionalCountTag(tags, 'current_participants', input.currentParticipants);
  appendOptionalCountTag(tags, 'total_participants', input.totalParticipants);
  tags.push(...(input.participants ?? []).map(buildNip53ParticipantTag));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !MEETING_ROOM_TAGS.has(tag[0])));

  return {
    kind: NIP53_MEETING_ROOM_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip53RoomPresence(input: BuildNip53RoomPresenceInput): EventParameters {
  const tags: string[][] = [
    buildNip53AddressTag(assertAddressKind(input.room, NIP53_MEETING_SPACE_KIND, 'room presence'))
  ];
  if (input.handRaised) tags.push(['hand', '1']);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !ROOM_PRESENCE_TAGS.has(tag[0])));

  return {
    kind: NIP53_ROOM_PRESENCE_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip53AddressTag(input: Nip53AddressInput): string[] {
  const value = `${input.kind}:${normalizeNonEmpty(input.pubkey, 'address pubkey')}:${normalizeNonEmpty(
    input.identifier,
    'address identifier'
  )}`;
  const relayHint = input.relayHint?.trim();
  const marker = input.marker?.trim();
  if (marker) return ['a', value, relayHint ?? '', marker];
  return relayHint ? ['a', value, relayHint] : ['a', value];
}

export function buildNip53ParticipantTag(input: Nip53ParticipantInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'participant pubkey');
  const relayHint = input.relayHint?.trim() ?? '';
  const role = input.role?.trim();
  const proof = input.proof?.trim();
  const tag = role
    ? ['p', pubkey, relayHint, role]
    : relayHint
      ? ['p', pubkey, relayHint]
      : ['p', pubkey];
  if (proof) tag.push(proof);
  return tag;
}

export function parseNip53LiveStream(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip53LiveStreamSnapshot | null {
  if (event.kind !== NIP53_LIVE_STREAM_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  if (!identifier) return null;
  const status = firstTagValue(event.tags, 'status');

  return {
    kind: NIP53_LIVE_STREAM_KIND,
    identifier,
    content: event.content,
    title: firstTagValue(event.tags, 'title'),
    summary: firstTagValue(event.tags, 'summary'),
    image: firstTagValue(event.tags, 'image'),
    hashtags: tagValues(event.tags, 't'),
    streamingUrl: firstTagValue(event.tags, 'streaming'),
    recordingUrl: firstTagValue(event.tags, 'recording'),
    starts: parseNullableTimestamp(firstTagValue(event.tags, 'starts')),
    ends: parseNullableTimestamp(firstTagValue(event.tags, 'ends')),
    status: status && isNip53ActivityStatus(status) ? status : null,
    currentParticipants: parseNullableCount(firstTagValue(event.tags, 'current_participants')),
    totalParticipants: parseNullableCount(firstTagValue(event.tags, 'total_participants')),
    participants: parseNip53ParticipantTags(event.tags),
    relays: parseNip53RelaysTag(event.tags),
    pinnedEventIds: tagValues(event.tags, 'pinned'),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip53LiveChat(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip53LiveChatSnapshot | null {
  if (event.kind !== NIP53_LIVE_CHAT_KIND) return null;
  const activity = parseNip53AddressTags(event.tags, [NIP53_LIVE_STREAM_KIND])[0];
  if (!activity) return null;
  const parent = event.tags.find((tag) => tag[0] === 'e');

  return {
    kind: NIP53_LIVE_CHAT_KIND,
    content: event.content,
    activity,
    parentEventId: parent?.[1]?.trim() || null,
    parentRelayHint: parent?.[2]?.trim() || null,
    quoteTags: copyTags(event.tags.filter((tag) => tag[0] === 'q')),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip53MeetingSpace(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip53MeetingSpaceSnapshot | null {
  if (event.kind !== NIP53_MEETING_SPACE_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  const room = firstTagValue(event.tags, 'room');
  const status = firstTagValue(event.tags, 'status');
  const serviceUrl = firstTagValue(event.tags, 'service');
  const providers = parseNip53ParticipantTags(event.tags);
  if (
    !identifier ||
    !room ||
    !status ||
    !isNip53SpaceStatus(status) ||
    !serviceUrl ||
    providers.length === 0
  ) {
    return null;
  }

  return {
    kind: NIP53_MEETING_SPACE_KIND,
    identifier,
    room,
    status,
    serviceUrl,
    content: event.content,
    summary: firstTagValue(event.tags, 'summary'),
    image: firstTagValue(event.tags, 'image'),
    endpointUrl: firstTagValue(event.tags, 'endpoint'),
    hashtags: tagValues(event.tags, 't'),
    providers,
    relays: parseNip53RelaysTag(event.tags),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip53MeetingRoom(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip53MeetingRoomSnapshot | null {
  if (event.kind !== NIP53_MEETING_ROOM_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  const parentSpace = parseNip53AddressTags(event.tags, [NIP53_MEETING_SPACE_KIND])[0];
  const title = firstTagValue(event.tags, 'title');
  const starts = parseNullableTimestamp(firstTagValue(event.tags, 'starts'));
  const status = firstTagValue(event.tags, 'status');
  if (
    !identifier ||
    !parentSpace ||
    !title ||
    starts === null ||
    !status ||
    !isNip53ActivityStatus(status)
  ) {
    return null;
  }

  return {
    kind: NIP53_MEETING_ROOM_KIND,
    identifier,
    parentSpace,
    title,
    starts,
    status,
    content: event.content,
    summary: firstTagValue(event.tags, 'summary'),
    image: firstTagValue(event.tags, 'image'),
    ends: parseNullableTimestamp(firstTagValue(event.tags, 'ends')),
    currentParticipants: parseNullableCount(firstTagValue(event.tags, 'current_participants')),
    totalParticipants: parseNullableCount(firstTagValue(event.tags, 'total_participants')),
    participants: parseNip53ParticipantTags(event.tags),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip53RoomPresence(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip53RoomPresenceSnapshot | null {
  if (event.kind !== NIP53_ROOM_PRESENCE_KIND) return null;
  const room = parseNip53AddressTags(event.tags, [NIP53_MEETING_SPACE_KIND])[0];
  if (!room) return null;

  return {
    kind: NIP53_ROOM_PRESENCE_KIND,
    room,
    handRaised: firstTagValue(event.tags, 'hand') === '1',
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip53ParticipantTags(
  tags: readonly (readonly string[])[]
): Nip53Participant[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'p') return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    return [
      {
        pubkey,
        relayHint: tag[2]?.trim() || null,
        role: tag[3]?.trim() || null,
        proof: tag[4]?.trim() || null
      }
    ];
  });
}

export function parseNip53AddressTags(
  tags: readonly (readonly string[])[],
  allowedKinds: readonly number[] = [
    NIP53_LIVE_STREAM_KIND,
    NIP53_MEETING_SPACE_KIND,
    NIP53_MEETING_ROOM_KIND
  ]
): Nip53Address[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'a') return [];
    const parsed = parseNip53Address(tag[1] ?? '', tag[2], tag[3], allowedKinds);
    return parsed ? [parsed] : [];
  });
}

export function parseNip53Address(
  value: string,
  relayHint: string | null | undefined = null,
  marker: string | null | undefined = null,
  allowedKinds: readonly number[] = [
    NIP53_LIVE_STREAM_KIND,
    NIP53_MEETING_SPACE_KIND,
    NIP53_MEETING_ROOM_KIND
  ]
): Nip53Address | null {
  const parts = value.trim().split(':');
  if (parts.length < 3) return null;
  const kind = Number(parts[0]);
  const pubkey = parts[1]?.trim();
  const identifier = parts.slice(2).join(':').trim();
  if (!isNip53AddressKind(kind) || !allowedKinds.includes(kind) || !pubkey || !identifier) {
    return null;
  }
  return {
    kind,
    pubkey,
    identifier,
    value: `${kind}:${pubkey}:${identifier}`,
    relayHint: relayHint?.trim() || null,
    marker: marker?.trim() || null
  };
}

export function parseNip53RelaysTag(tags: readonly (readonly string[])[]): string[] {
  const tag = tags.find((candidate) => candidate[0] === 'relays');
  return normalizeStringList(tag?.slice(1) ?? []);
}

export function isNip53ActivityStatus(value: string): value is Nip53ActivityStatus {
  return ACTIVITY_STATUS_SET.has(value);
}

export function isNip53SpaceStatus(value: string): value is Nip53SpaceStatus {
  return SPACE_STATUS_SET.has(value);
}

export function isNip53AddressKind(kind: number): kind is Nip53AddressKind {
  return (
    kind === NIP53_LIVE_STREAM_KIND ||
    kind === NIP53_MEETING_SPACE_KIND ||
    kind === NIP53_MEETING_ROOM_KIND
  );
}

function assertAddressKind<T extends Nip53AddressKind>(
  address: Nip53AddressInput,
  expectedKind: T,
  label: string
): Nip53AddressInput & { readonly kind: T } {
  if (address.kind !== expectedKind) {
    throw new Error(`NIP-53 ${label} must reference kind:${expectedKind}`);
  }
  return address as Nip53AddressInput & { readonly kind: T };
}

function appendOptionalTag(
  tags: string[][],
  tagName: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) tags.push([tagName, normalized]);
}

function appendOptionalNumberTag(
  tags: string[][],
  tagName: string,
  value: number | null | undefined
): void {
  if (value === undefined || value === null) return;
  tags.push([tagName, String(value)]);
}

function appendOptionalCountTag(
  tags: string[][],
  tagName: string,
  value: number | null | undefined
): void {
  if (value === undefined || value === null) return;
  assertCount(value, tagName);
  tags.push([tagName, String(value)]);
}

function appendRelaysTag(tags: string[][], relays: readonly string[] | undefined): void {
  const normalized = normalizeStringList(relays ?? []);
  if (normalized.length > 0) tags.push(['relays', ...normalized]);
}

function parseNullableTimestamp(value: string | null): number | null {
  if (value === null) return null;
  return parseUnsignedInteger(value);
}

function parseNullableCount(value: string | null): number | null {
  if (value === null) return null;
  return parseUnsignedInteger(value);
}

function parseUnsignedInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-53 ${label} must be a non-negative safe integer`);
  }
}

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-53 ${label} must be a non-negative safe integer`);
  }
}

function tagValues(tags: readonly (readonly string[])[], tagName: string): string[] {
  return tags
    .filter((tag) => tag[0] === tagName)
    .map((tag) => tag[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  return tagValues(tags, tagName)[0] ?? null;
}

function normalizeStringList(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-53 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
