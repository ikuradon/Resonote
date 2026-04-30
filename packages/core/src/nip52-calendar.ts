import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP52_DATE_BASED_CALENDAR_EVENT_KIND = 31922;
export const NIP52_TIME_BASED_CALENDAR_EVENT_KIND = 31923;
export const NIP52_CALENDAR_KIND = 31924;
export const NIP52_CALENDAR_RSVP_KIND = 31925;
export const NIP52_CALENDAR_EVENT_KINDS = [
  NIP52_DATE_BASED_CALENDAR_EVENT_KIND,
  NIP52_TIME_BASED_CALENDAR_EVENT_KIND
] as const;
export const NIP52_RSVP_STATUSES = ['accepted', 'declined', 'tentative'] as const;
export const NIP52_FREE_BUSY_VALUES = ['free', 'busy'] as const;

export type Nip52CalendarEventKind = (typeof NIP52_CALENDAR_EVENT_KINDS)[number];
export type Nip52RsvpStatus = (typeof NIP52_RSVP_STATUSES)[number];
export type Nip52FreeBusy = (typeof NIP52_FREE_BUSY_VALUES)[number];

export interface Nip52ParticipantInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
  readonly role?: string | null;
}

export interface Nip52Participant {
  readonly pubkey: string;
  readonly relayHint: string | null;
  readonly role: string | null;
}

export interface Nip52AddressPointerInput {
  readonly kind: Nip52CalendarEventKind | typeof NIP52_CALENDAR_KIND;
  readonly pubkey: string;
  readonly identifier: string;
  readonly relayHint?: string | null;
}

export interface Nip52AddressPointer {
  readonly kind: Nip52CalendarEventKind | typeof NIP52_CALENDAR_KIND;
  readonly pubkey: string;
  readonly identifier: string;
  readonly value: string;
  readonly relayHint: string | null;
}

export interface Nip52CommonCalendarEventInput {
  readonly identifier: string;
  readonly title: string;
  readonly content?: string;
  readonly summary?: string | null;
  readonly image?: string | null;
  readonly locations?: readonly string[];
  readonly geohash?: string | null;
  readonly participants?: readonly Nip52ParticipantInput[];
  readonly hashtags?: readonly string[];
  readonly references?: readonly string[];
  readonly calendarRequests?: readonly Nip52AddressPointerInput[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip52DateCalendarEventInput extends Nip52CommonCalendarEventInput {
  readonly startDate: string;
  readonly endDate?: string | null;
}

export interface BuildNip52TimeCalendarEventInput extends Nip52CommonCalendarEventInput {
  readonly startTimestamp: number;
  readonly endTimestamp?: number | null;
  readonly startTzid?: string | null;
  readonly endTzid?: string | null;
  readonly dayTimestamps?: readonly number[];
}

export interface BuildNip52CalendarInput {
  readonly identifier: string;
  readonly title: string;
  readonly content?: string;
  readonly events?: readonly Nip52AddressPointerInput[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip52RsvpInput {
  readonly identifier: string;
  readonly event: Nip52AddressPointerInput;
  readonly status: Nip52RsvpStatus;
  readonly content?: string;
  readonly eventId?: string | null;
  readonly eventRelayHint?: string | null;
  readonly freeBusy?: Nip52FreeBusy | null;
  readonly authorPubkey?: string | null;
  readonly authorRelayHint?: string | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip52CalendarEventMetadata {
  readonly identifier: string;
  readonly title: string;
  readonly summary: string | null;
  readonly image: string | null;
  readonly locations: readonly string[];
  readonly geohash: string | null;
  readonly participants: readonly Nip52Participant[];
  readonly hashtags: readonly string[];
  readonly references: readonly string[];
  readonly calendarRequests: readonly Nip52AddressPointer[];
  readonly deprecatedName: string | null;
}

export interface Nip52DateCalendarEventSnapshot {
  readonly kind: typeof NIP52_DATE_BASED_CALENDAR_EVENT_KIND;
  readonly content: string;
  readonly metadata: Nip52CalendarEventMetadata;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip52TimeCalendarEventSnapshot {
  readonly kind: typeof NIP52_TIME_BASED_CALENDAR_EVENT_KIND;
  readonly content: string;
  readonly metadata: Nip52CalendarEventMetadata;
  readonly startTimestamp: number;
  readonly endTimestamp: number | null;
  readonly startTzid: string | null;
  readonly endTzid: string | null;
  readonly dayTimestamps: readonly number[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip52CalendarSnapshot {
  readonly kind: typeof NIP52_CALENDAR_KIND;
  readonly content: string;
  readonly identifier: string;
  readonly title: string;
  readonly events: readonly Nip52AddressPointer[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip52RsvpSnapshot {
  readonly kind: typeof NIP52_CALENDAR_RSVP_KIND;
  readonly content: string;
  readonly identifier: string;
  readonly status: Nip52RsvpStatus;
  readonly freeBusy: Nip52FreeBusy | null;
  readonly event: Nip52AddressPointer;
  readonly eventId: string | null;
  readonly eventRelayHint: string | null;
  readonly authorPubkey: string | null;
  readonly authorRelayHint: string | null;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

const CALENDAR_EVENT_KIND_SET = new Set<number>(NIP52_CALENDAR_EVENT_KINDS);
const RSVP_STATUS_SET = new Set<string>(NIP52_RSVP_STATUSES);
const FREE_BUSY_SET = new Set<string>(NIP52_FREE_BUSY_VALUES);
const COMMON_CALENDAR_EVENT_TAGS = new Set([
  'd',
  'title',
  'summary',
  'image',
  'location',
  'g',
  'p',
  't',
  'r',
  'a',
  'name'
]);
const DATE_CALENDAR_EVENT_TAGS = new Set([...COMMON_CALENDAR_EVENT_TAGS, 'start', 'end']);
const TIME_CALENDAR_EVENT_TAGS = new Set([
  ...COMMON_CALENDAR_EVENT_TAGS,
  'start',
  'end',
  'start_tzid',
  'end_tzid',
  'D'
]);
const CALENDAR_TAGS = new Set(['d', 'title', 'a']);
const RSVP_TAGS = new Set(['d', 'status', 'fb', 'a', 'e', 'p']);
const SECONDS_IN_DAY = 86_400;

export function buildNip52DateCalendarEvent(
  input: BuildNip52DateCalendarEventInput
): EventParameters {
  const startDate = normalizeNip52Date(input.startDate, 'start date');
  const endDate =
    input.endDate === undefined || input.endDate === null
      ? null
      : normalizeNip52Date(input.endDate, 'end date');
  if (endDate && startDate >= endDate) {
    throw new Error('NIP-52 date calendar event end date must be after start date');
  }

  const tags = buildCommonCalendarEventTags(input);
  tags.push(['start', startDate]);
  if (endDate) tags.push(['end', endDate]);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !DATE_CALENDAR_EVENT_TAGS.has(tag[0])));

  return {
    kind: NIP52_DATE_BASED_CALENDAR_EVENT_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip52TimeCalendarEvent(
  input: BuildNip52TimeCalendarEventInput
): EventParameters {
  assertTimestamp(input.startTimestamp, 'start timestamp');
  if (input.endTimestamp !== undefined && input.endTimestamp !== null) {
    assertTimestamp(input.endTimestamp, 'end timestamp');
    if (input.startTimestamp >= input.endTimestamp) {
      throw new Error('NIP-52 time calendar event end timestamp must be after start timestamp');
    }
  }

  const tags = buildCommonCalendarEventTags(input);
  tags.push(['start', String(input.startTimestamp)]);
  if (input.endTimestamp !== undefined && input.endTimestamp !== null) {
    tags.push(['end', String(input.endTimestamp)]);
  }
  for (const dayTimestamp of normalizeDayTimestamps(input)) {
    tags.push(['D', String(dayTimestamp)]);
  }
  appendOptionalTag(tags, 'start_tzid', input.startTzid);
  appendOptionalTag(tags, 'end_tzid', input.endTzid);
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !TIME_CALENDAR_EVENT_TAGS.has(tag[0])));

  return {
    kind: NIP52_TIME_BASED_CALENDAR_EVENT_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip52Calendar(input: BuildNip52CalendarInput): EventParameters {
  const tags: string[][] = [
    ['d', normalizeNonEmpty(input.identifier, 'calendar identifier')],
    ['title', normalizeNonEmpty(input.title, 'calendar title')]
  ];
  tags.push(
    ...(input.events ?? []).map((event) =>
      buildNip52AddressTag(assertCalendarEventPointer(event, 'calendar event'))
    )
  );
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !CALENDAR_TAGS.has(tag[0])));

  return {
    kind: NIP52_CALENDAR_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip52Rsvp(input: BuildNip52RsvpInput): EventParameters {
  if (!isNip52RsvpStatus(input.status)) {
    throw new Error(`Unsupported NIP-52 RSVP status: ${input.status}`);
  }

  const tags: string[][] = [
    buildNip52AddressTag(assertCalendarEventPointer(input.event, 'RSVP event')),
    ['d', normalizeNonEmpty(input.identifier, 'RSVP identifier')],
    ['status', input.status]
  ];
  if (input.eventId?.trim())
    tags.unshift(buildNip52EventRevisionTag(input.eventId, input.eventRelayHint));
  if (input.status !== 'declined' && input.freeBusy) {
    if (!isNip52FreeBusy(input.freeBusy)) {
      throw new Error(`Unsupported NIP-52 free/busy value: ${input.freeBusy}`);
    }
    tags.push(['fb', input.freeBusy]);
  }
  const authorPubkey = input.authorPubkey?.trim();
  if (authorPubkey) {
    const relayHint = input.authorRelayHint?.trim();
    tags.push(relayHint ? ['p', authorPubkey, relayHint] : ['p', authorPubkey]);
  }
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !RSVP_TAGS.has(tag[0])));

  return {
    kind: NIP52_CALENDAR_RSVP_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip52AddressTag(input: Nip52AddressPointerInput): string[] {
  const value = `${assertNip52AddressKind(input.kind)}:${normalizeNonEmpty(
    input.pubkey,
    'address pubkey'
  )}:${normalizeNonEmpty(input.identifier, 'address identifier')}`;
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['a', value, relayHint] : ['a', value];
}

export function buildNip52EventRevisionTag(eventId: string, relayHint?: string | null): string[] {
  const normalized = normalizeNonEmpty(eventId, 'event id');
  const relay = relayHint?.trim();
  return relay ? ['e', normalized, relay] : ['e', normalized];
}

export function buildNip52ParticipantTag(input: Nip52ParticipantInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'participant pubkey');
  const relayHint = input.relayHint?.trim() ?? '';
  const role = input.role?.trim();
  return role
    ? ['p', pubkey, relayHint, role]
    : relayHint
      ? ['p', pubkey, relayHint]
      : ['p', pubkey];
}

export function parseNip52DateCalendarEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip52DateCalendarEventSnapshot | null {
  if (event.kind !== NIP52_DATE_BASED_CALENDAR_EVENT_KIND) return null;
  const metadata = parseNip52CalendarEventMetadata(event.tags);
  const startDate = firstTagValue(event.tags, 'start');
  const endDate = firstTagValue(event.tags, 'end');
  if (!metadata || !startDate || !isNip52Date(startDate)) return null;
  if (endDate && (!isNip52Date(endDate) || startDate >= endDate)) return null;

  return {
    kind: NIP52_DATE_BASED_CALENDAR_EVENT_KIND,
    content: event.content,
    metadata,
    startDate,
    endDate,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip52TimeCalendarEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip52TimeCalendarEventSnapshot | null {
  if (event.kind !== NIP52_TIME_BASED_CALENDAR_EVENT_KIND) return null;
  const metadata = parseNip52CalendarEventMetadata(event.tags);
  const startTimestamp = parseTimestamp(firstTagValue(event.tags, 'start'));
  const endTimestamp = parseTimestamp(firstTagValue(event.tags, 'end'));
  const dayTimestamps = parseNip52DayTimestamps(event.tags);
  if (!metadata || typeof startTimestamp !== 'number' || dayTimestamps.length === 0) return null;
  if (endTimestamp === undefined || (endTimestamp !== null && startTimestamp >= endTimestamp)) {
    return null;
  }

  return {
    kind: NIP52_TIME_BASED_CALENDAR_EVENT_KIND,
    content: event.content,
    metadata,
    startTimestamp,
    endTimestamp,
    startTzid: firstTagValue(event.tags, 'start_tzid'),
    endTzid: firstTagValue(event.tags, 'end_tzid'),
    dayTimestamps,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip52Calendar(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip52CalendarSnapshot | null {
  if (event.kind !== NIP52_CALENDAR_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  const title = firstTagValue(event.tags, 'title');
  if (!identifier || !title) return null;

  return {
    kind: NIP52_CALENDAR_KIND,
    content: event.content,
    identifier,
    title,
    events: parseNip52AddressTags(event.tags, NIP52_CALENDAR_EVENT_KINDS),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip52Rsvp(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip52RsvpSnapshot | null {
  if (event.kind !== NIP52_CALENDAR_RSVP_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  const status = firstTagValue(event.tags, 'status');
  const eventPointer = parseNip52AddressTags(event.tags, NIP52_CALENDAR_EVENT_KINDS)[0];
  if (!identifier || !status || !isNip52RsvpStatus(status) || !eventPointer) return null;

  const eventTag = event.tags.find((tag) => tag[0] === 'e');
  const authorTag = event.tags.find((tag) => tag[0] === 'p');
  const freeBusy = firstTagValue(event.tags, 'fb');
  const parsedFreeBusy =
    freeBusy && status !== 'declined' && isNip52FreeBusy(freeBusy) ? freeBusy : null;

  return {
    kind: NIP52_CALENDAR_RSVP_KIND,
    content: event.content,
    identifier,
    status,
    freeBusy: parsedFreeBusy,
    event: eventPointer,
    eventId: eventTag?.[1]?.trim() || null,
    eventRelayHint: eventTag?.[2]?.trim() || null,
    authorPubkey: authorTag?.[1]?.trim() || null,
    authorRelayHint: authorTag?.[2]?.trim() || null,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip52CalendarEventMetadata(
  tags: readonly (readonly string[])[]
): Nip52CalendarEventMetadata | null {
  const identifier = firstTagValue(tags, 'd');
  const title = firstTagValue(tags, 'title') ?? firstTagValue(tags, 'name');
  if (!identifier || !title) return null;

  return {
    identifier,
    title,
    summary: firstTagValue(tags, 'summary'),
    image: firstTagValue(tags, 'image'),
    locations: tagValues(tags, 'location'),
    geohash: firstTagValue(tags, 'g'),
    participants: parseNip52Participants(tags),
    hashtags: tagValues(tags, 't'),
    references: tagValues(tags, 'r'),
    calendarRequests: parseNip52AddressTags(tags, [NIP52_CALENDAR_KIND]),
    deprecatedName: firstTagValue(tags, 'name')
  };
}

export function parseNip52Participants(tags: readonly (readonly string[])[]): Nip52Participant[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'p') return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    return [
      {
        pubkey,
        relayHint: tag[2]?.trim() || null,
        role: tag[3]?.trim() || null
      }
    ];
  });
}

export function parseNip52AddressTags(
  tags: readonly (readonly string[])[],
  allowedKinds: readonly number[]
): Nip52AddressPointer[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'a') return [];
    const parsed = parseNip52AddressPointer(tag[1] ?? '', tag[2], allowedKinds);
    return parsed ? [parsed] : [];
  });
}

export function parseNip52AddressPointer(
  value: string,
  relayHint: string | null | undefined = null,
  allowedKinds: readonly number[] = [
    NIP52_DATE_BASED_CALENDAR_EVENT_KIND,
    NIP52_TIME_BASED_CALENDAR_EVENT_KIND,
    NIP52_CALENDAR_KIND
  ]
): Nip52AddressPointer | null {
  const parts = value.trim().split(':');
  if (parts.length < 3) return null;
  const kind = Number(parts[0]);
  const pubkey = parts[1]?.trim();
  const identifier = parts.slice(2).join(':').trim();
  if (!Number.isSafeInteger(kind) || !allowedKinds.includes(kind) || !pubkey || !identifier) {
    return null;
  }
  return {
    kind: kind as Nip52AddressPointer['kind'],
    pubkey,
    identifier,
    value: `${kind}:${pubkey}:${identifier}`,
    relayHint: relayHint?.trim() || null
  };
}

export function parseNip52DayTimestamps(tags: readonly (readonly string[])[]): number[] {
  return [
    ...new Set(
      tags
        .filter((tag) => tag[0] === 'D')
        .map((tag) => parseTimestamp(tag[1]))
        .filter((value): value is number => typeof value === 'number')
    )
  ].sort((left, right) => left - right);
}

export function isNip52CalendarEventKind(kind: number): kind is Nip52CalendarEventKind {
  return CALENDAR_EVENT_KIND_SET.has(kind);
}

export function isNip52RsvpStatus(value: string): value is Nip52RsvpStatus {
  return RSVP_STATUS_SET.has(value);
}

export function isNip52FreeBusy(value: string): value is Nip52FreeBusy {
  return FREE_BUSY_SET.has(value);
}

export function isNip52Date(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function buildCommonCalendarEventTags(input: Nip52CommonCalendarEventInput): string[][] {
  const tags: string[][] = [
    ['d', normalizeNonEmpty(input.identifier, 'calendar event identifier')],
    ['title', normalizeNonEmpty(input.title, 'calendar event title')]
  ];
  appendOptionalTag(tags, 'summary', input.summary);
  appendOptionalTag(tags, 'image', input.image);
  for (const location of normalizeStringList(input.locations ?? []))
    tags.push(['location', location]);
  appendOptionalTag(tags, 'g', input.geohash);
  tags.push(...(input.participants ?? []).map(buildNip52ParticipantTag));
  for (const hashtag of normalizeStringList(input.hashtags ?? [])) tags.push(['t', hashtag]);
  for (const reference of normalizeStringList(input.references ?? [])) tags.push(['r', reference]);
  tags.push(
    ...(input.calendarRequests ?? []).map((calendar) =>
      buildNip52AddressTag(assertCalendarPointer(calendar, 'calendar request'))
    )
  );
  return tags;
}

function normalizeDayTimestamps(input: BuildNip52TimeCalendarEventInput): number[] {
  if (input.dayTimestamps && input.dayTimestamps.length > 0) {
    for (const dayTimestamp of input.dayTimestamps) {
      assertTimestamp(dayTimestamp, 'day timestamp');
    }
    return [...new Set(input.dayTimestamps)].sort((left, right) => left - right);
  }

  const startDay = Math.floor(input.startTimestamp / SECONDS_IN_DAY);
  const lastTimestamp =
    input.endTimestamp === undefined || input.endTimestamp === null
      ? input.startTimestamp
      : input.endTimestamp - 1;
  const endDay = Math.floor(lastTimestamp / SECONDS_IN_DAY);
  const days: number[] = [];
  for (let day = startDay; day <= endDay; day += 1) days.push(day);
  return days;
}

function assertCalendarPointer(
  pointer: Nip52AddressPointerInput,
  label: string
): Nip52AddressPointerInput {
  if (pointer.kind !== NIP52_CALENDAR_KIND) {
    throw new Error(`NIP-52 ${label} must reference kind:${NIP52_CALENDAR_KIND}`);
  }
  return pointer;
}

function assertCalendarEventPointer(
  pointer: Nip52AddressPointerInput,
  label: string
): Nip52AddressPointerInput {
  if (!isNip52CalendarEventKind(pointer.kind)) {
    throw new Error(`NIP-52 ${label} must reference kind:31922 or kind:31923`);
  }
  return pointer;
}

function assertNip52AddressKind(
  kind: Nip52AddressPointerInput['kind']
): Nip52AddressPointerInput['kind'] {
  if (kind !== NIP52_CALENDAR_KIND && !isNip52CalendarEventKind(kind)) {
    throw new Error(`Unsupported NIP-52 address kind: ${kind}`);
  }
  return kind;
}

function normalizeNip52Date(value: string, label: string): string {
  const normalized = normalizeNonEmpty(value, label);
  if (!isNip52Date(normalized)) throw new Error(`NIP-52 ${label} must be YYYY-MM-DD`);
  return normalized;
}

function appendOptionalTag(
  tags: string[][],
  tagName: 'summary' | 'image' | 'g' | 'start_tzid' | 'end_tzid',
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) tags.push([tagName, normalized]);
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

function parseTimestamp(value: string | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-52 ${label} must be a non-negative safe integer`);
  }
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-52 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
