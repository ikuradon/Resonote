import type { Event as NostrEvent, EventParameters, Filter } from 'nostr-typedef';

export const NIP43_MEMBER_LIST_KIND = 13534;
export const NIP43_ADD_MEMBER_KIND = 8000;
export const NIP43_REMOVE_MEMBER_KIND = 8001;
export const NIP43_JOIN_REQUEST_KIND = 28934;
export const NIP43_INVITE_CLAIM_KIND = 28935;
export const NIP43_LEAVE_REQUEST_KIND = 28936;
export const NIP43_SUPPORTED_NIP = 43;
export const NIP43_PROTECTED_TAG = '-';
export const NIP43_MEMBER_TAG = 'member';
export const NIP43_CLAIM_TAG = 'claim';
export const NIP43_RESTRICTED_PREFIX = 'restricted:';
export const NIP43_ACCESS_KINDS = [
  NIP43_MEMBER_LIST_KIND,
  NIP43_ADD_MEMBER_KIND,
  NIP43_REMOVE_MEMBER_KIND,
  NIP43_JOIN_REQUEST_KIND,
  NIP43_INVITE_CLAIM_KIND,
  NIP43_LEAVE_REQUEST_KIND
] as const;

export type Nip43AccessKind = (typeof NIP43_ACCESS_KINDS)[number];

export interface BuildNip43MembershipListInput {
  readonly members: readonly string[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip43MemberChangeInput {
  readonly pubkey: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip43ClaimInput {
  readonly claim: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip43InviteClaimFilterInput {
  readonly relayPubkey?: string | null;
  readonly since?: number | null;
  readonly until?: number | null;
  readonly limit?: number | null;
}

export interface Nip43MembershipListSnapshot {
  readonly kind: typeof NIP43_MEMBER_LIST_KIND;
  readonly members: readonly string[];
  readonly protected: boolean;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip43MemberChangeSnapshot {
  readonly kind: typeof NIP43_ADD_MEMBER_KIND | typeof NIP43_REMOVE_MEMBER_KIND;
  readonly pubkey: string;
  readonly protected: boolean;
  readonly customTags: readonly string[][];
  readonly relayPubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip43ClaimSnapshot {
  readonly kind: typeof NIP43_JOIN_REQUEST_KIND | typeof NIP43_INVITE_CLAIM_KIND;
  readonly claim: string;
  readonly protected: boolean;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

export interface Nip43LeaveRequestSnapshot {
  readonly kind: typeof NIP43_LEAVE_REQUEST_KIND;
  readonly protected: boolean;
  readonly customTags: readonly string[][];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly id: string | null;
}

const HEX_64 = /^[0-9a-f]{64}$/i;
const STRUCTURED_MEMBER_LIST_TAGS = new Set([NIP43_PROTECTED_TAG, NIP43_MEMBER_TAG]);
const STRUCTURED_MEMBER_CHANGE_TAGS = new Set([NIP43_PROTECTED_TAG, 'p']);
const STRUCTURED_CLAIM_TAGS = new Set([NIP43_PROTECTED_TAG, NIP43_CLAIM_TAG]);
const STRUCTURED_LEAVE_TAGS = new Set([NIP43_PROTECTED_TAG]);

export function isNip43AccessKind(kind: number): kind is Nip43AccessKind {
  return (NIP43_ACCESS_KINDS as readonly number[]).includes(kind);
}

export function relaySupportsNip43RelayAccess(info: {
  readonly supported_nips?: readonly number[] | null;
}): boolean {
  return info.supported_nips?.includes(NIP43_SUPPORTED_NIP) ?? false;
}

export function buildNip43MembershipListEvent(
  input: BuildNip43MembershipListInput
): EventParameters {
  return {
    kind: NIP43_MEMBER_LIST_KIND,
    content: '',
    tags: [
      [NIP43_PROTECTED_TAG],
      ...input.members.map((member) => [NIP43_MEMBER_TAG, normalizeHex64(member, 'member pubkey')]),
      ...copyCustomTags(input.tags ?? [], STRUCTURED_MEMBER_LIST_TAGS)
    ]
  };
}

export function buildNip43AddMemberEvent(input: BuildNip43MemberChangeInput): EventParameters {
  return buildNip43MemberChangeEvent(NIP43_ADD_MEMBER_KIND, input);
}

export function buildNip43RemoveMemberEvent(input: BuildNip43MemberChangeInput): EventParameters {
  return buildNip43MemberChangeEvent(NIP43_REMOVE_MEMBER_KIND, input);
}

export function buildNip43JoinRequestEvent(input: BuildNip43ClaimInput): EventParameters {
  return buildNip43ClaimEvent(NIP43_JOIN_REQUEST_KIND, input);
}

export function buildNip43InviteClaimEvent(input: BuildNip43ClaimInput): EventParameters {
  return buildNip43ClaimEvent(NIP43_INVITE_CLAIM_KIND, input);
}

export function buildNip43LeaveRequestEvent(
  tags: readonly (readonly string[])[] = []
): EventParameters {
  return {
    kind: NIP43_LEAVE_REQUEST_KIND,
    content: '',
    tags: [[NIP43_PROTECTED_TAG], ...copyCustomTags(tags, STRUCTURED_LEAVE_TAGS)]
  };
}

export function buildNip43InviteClaimFilter(input: BuildNip43InviteClaimFilterInput = {}): Filter {
  const filter: Filter = { kinds: [NIP43_INVITE_CLAIM_KIND] };
  if (input.relayPubkey) {
    filter.authors = [normalizeHex64(input.relayPubkey, 'relay pubkey')];
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
  return filter;
}

export function parseNip43MembershipListEvent(
  event: Pick<NostrEvent, 'kind' | 'tags'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip43MembershipListSnapshot | null {
  if (event.kind !== NIP43_MEMBER_LIST_KIND) return null;
  return {
    kind: NIP43_MEMBER_LIST_KIND,
    members: parseNip43MemberTags(event.tags),
    protected: hasNip43ProtectedTag(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_MEMBER_LIST_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip43MemberChangeEvent(
  event: Pick<NostrEvent, 'kind' | 'tags'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip43MemberChangeSnapshot | null {
  if (event.kind !== NIP43_ADD_MEMBER_KIND && event.kind !== NIP43_REMOVE_MEMBER_KIND) {
    return null;
  }
  const pubkey = event.tags.find((tag) => tag[0] === 'p')?.[1]?.trim();
  if (!pubkey) return null;
  return {
    kind: event.kind,
    pubkey,
    protected: hasNip43ProtectedTag(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_MEMBER_CHANGE_TAGS.has(tag[0])),
    relayPubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip43ClaimEvent(
  event: Pick<NostrEvent, 'kind' | 'tags'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip43ClaimSnapshot | null {
  if (event.kind !== NIP43_JOIN_REQUEST_KIND && event.kind !== NIP43_INVITE_CLAIM_KIND) {
    return null;
  }
  const claim = parseNip43ClaimTag(event.tags);
  if (!claim) return null;
  return {
    kind: event.kind,
    claim,
    protected: hasNip43ProtectedTag(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_CLAIM_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip43LeaveRequestEvent(
  event: Pick<NostrEvent, 'kind' | 'tags'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at' | 'id'>>
): Nip43LeaveRequestSnapshot | null {
  if (event.kind !== NIP43_LEAVE_REQUEST_KIND) return null;
  return {
    kind: NIP43_LEAVE_REQUEST_KIND,
    protected: hasNip43ProtectedTag(event.tags),
    customTags: copyTags(event.tags).filter((tag) => !STRUCTURED_LEAVE_TAGS.has(tag[0])),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    id: event.id ?? null
  };
}

export function parseNip43MemberTags(tags: readonly (readonly string[])[]): string[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== NIP43_MEMBER_TAG) return [];
    const pubkey = tag[1]?.trim();
    return pubkey ? [pubkey] : [];
  });
}

export function parseNip43ClaimTag(tags: readonly (readonly string[])[]): string | null {
  return tags.find((tag) => tag[0] === NIP43_CLAIM_TAG && tag[1]?.trim())?.[1]?.trim() ?? null;
}

export function hasNip43ProtectedTag(tags: readonly (readonly string[])[]): boolean {
  return tags.some((tag) => tag[0] === NIP43_PROTECTED_TAG && tag.length === 1);
}

export function isNip43RestrictedOkMessage(message: string): boolean {
  return message.trim().toLowerCase().startsWith(NIP43_RESTRICTED_PREFIX);
}

function buildNip43MemberChangeEvent(
  kind: typeof NIP43_ADD_MEMBER_KIND | typeof NIP43_REMOVE_MEMBER_KIND,
  input: BuildNip43MemberChangeInput
): EventParameters {
  return {
    kind,
    content: '',
    tags: [
      [NIP43_PROTECTED_TAG],
      ['p', normalizeHex64(input.pubkey, 'member pubkey')],
      ...copyCustomTags(input.tags ?? [], STRUCTURED_MEMBER_CHANGE_TAGS)
    ]
  };
}

function buildNip43ClaimEvent(
  kind: typeof NIP43_JOIN_REQUEST_KIND | typeof NIP43_INVITE_CLAIM_KIND,
  input: BuildNip43ClaimInput
): EventParameters {
  return {
    kind,
    content: '',
    tags: [
      [NIP43_PROTECTED_TAG],
      [NIP43_CLAIM_TAG, normalizeNonEmpty(input.claim, 'claim')],
      ...copyCustomTags(input.tags ?? [], STRUCTURED_CLAIM_TAGS)
    ]
  };
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

function normalizeHex64(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!HEX_64.test(normalized)) {
    throw new Error(`NIP-43 ${label} must be 32-byte hex`);
  }
  return normalized;
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-43 ${label} must be non-empty`);
  return normalized;
}

function normalizeTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-43 ${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`NIP-43 ${label} must be a positive safe integer`);
  }
  return value;
}
