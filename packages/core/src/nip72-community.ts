import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP72_COMMUNITY_DEFINITION_KIND = 34550;
export const NIP72_APPROVAL_KIND = 4550;
export const NIP72_COMMUNITY_POST_KIND = 1111;
export const NIP72_MODERATOR_MARKER = 'moderator';
export const NIP72_COMMUNITY_KIND_TEXT = String(NIP72_COMMUNITY_DEFINITION_KIND);

export interface Nip72CommunityPointerInput {
  readonly pubkey: string;
  readonly identifier: string;
  readonly relayHint?: string | null;
}

export interface Nip72CommunityPointer {
  readonly pubkey: string;
  readonly identifier: string;
  readonly value: string;
  readonly relayHint: string | null;
}

export interface Nip72CommunityImageInput {
  readonly url: string;
  readonly dimensions?: string | null;
}

export interface Nip72CommunityImage {
  readonly url: string;
  readonly dimensions: string | null;
}

export interface Nip72ModeratorInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
}

export interface Nip72Moderator {
  readonly pubkey: string;
  readonly relayHint: string | null;
}

export interface Nip72RelayInput {
  readonly url: string;
  readonly marker?: string | null;
}

export interface Nip72Relay {
  readonly url: string;
  readonly marker: string | null;
}

export interface BuildNip72CommunityDefinitionInput {
  readonly identifier: string;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly image?: Nip72CommunityImageInput | null;
  readonly moderators?: readonly Nip72ModeratorInput[];
  readonly relays?: readonly Nip72RelayInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip72CommunityDefinitionSnapshot {
  readonly identifier: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly image: Nip72CommunityImage | null;
  readonly moderators: readonly Nip72Moderator[];
  readonly relays: readonly Nip72Relay[];
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly customTags: readonly string[][];
}

export interface Nip72ParentPostInput {
  readonly eventId: string;
  readonly pubkey: string;
  readonly kind: number;
  readonly relayHint?: string | null;
}

export interface Nip72ParentPost {
  readonly eventId: string;
  readonly pubkey: string;
  readonly kind: number;
  readonly relayHint: string | null;
}

export interface BuildNip72CommunityPostInput {
  readonly community: Nip72CommunityPointerInput;
  readonly content: string;
  readonly parent?: Nip72ParentPostInput | null;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip72CommunityPostSnapshot {
  readonly community: Nip72CommunityPointer;
  readonly topLevel: boolean;
  readonly parent: Nip72ParentPost | null;
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly customTags: readonly string[][];
}

export interface Nip72ApprovalPostInput {
  readonly eventId?: string | null;
  readonly address?: string | null;
  readonly authorPubkey: string;
  readonly authorRelayHint?: string | null;
  readonly kind: number;
}

export interface Nip72ApprovalPost {
  readonly eventId: string | null;
  readonly address: string | null;
  readonly authorPubkey: string;
  readonly authorRelayHint: string | null;
  readonly kind: number;
}

export interface BuildNip72ApprovalInput {
  readonly communities: readonly Nip72CommunityPointerInput[];
  readonly post: Nip72ApprovalPostInput;
  readonly content?: string;
  readonly approvedEvent?: unknown;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip72ApprovalSnapshot {
  readonly communities: readonly Nip72CommunityPointer[];
  readonly post: Nip72ApprovalPost;
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly customTags: readonly string[][];
}

const COMMUNITY_DEFINITION_TAGS = new Set(['d', 'name', 'description', 'image', 'p', 'relay']);
const COMMUNITY_POST_TAGS = new Set(['A', 'a', 'P', 'p', 'K', 'k', 'e']);
const APPROVAL_TAGS = new Set(['a', 'e', 'p', 'k']);

export function buildNip72CommunityDefinition(
  input: BuildNip72CommunityDefinitionInput
): EventParameters {
  const tags: string[][] = [['d', normalizeNonEmpty(input.identifier, 'community identifier')]];
  appendOptionalTag(tags, 'name', input.name);
  appendOptionalTag(tags, 'description', input.description);
  if (input.image) tags.push(buildNip72CommunityImageTag(input.image));
  tags.push(...(input.moderators ?? []).map(buildNip72ModeratorTag));
  tags.push(...(input.relays ?? []).map(buildNip72RelayTag));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !COMMUNITY_DEFINITION_TAGS.has(tag[0])));

  return {
    kind: NIP72_COMMUNITY_DEFINITION_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip72CommunityAddressTag(
  input: Nip72CommunityPointerInput,
  tagName = 'a'
): string[] {
  const value = `${NIP72_COMMUNITY_DEFINITION_KIND}:${normalizeNonEmpty(
    input.pubkey,
    'community pubkey'
  )}:${normalizeNonEmpty(input.identifier, 'community identifier')}`;
  const relayHint = input.relayHint?.trim();
  return relayHint ? [tagName, value, relayHint] : [tagName, value];
}

export function buildNip72CommunityPubkeyTag(
  input: Nip72CommunityPointerInput,
  tagName = 'p'
): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'community pubkey');
  const relayHint = input.relayHint?.trim();
  return relayHint ? [tagName, pubkey, relayHint] : [tagName, pubkey];
}

export function buildNip72ModeratorTag(input: Nip72ModeratorInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'moderator pubkey');
  return ['p', pubkey, input.relayHint?.trim() || '', NIP72_MODERATOR_MARKER];
}

export function buildNip72RelayTag(input: Nip72RelayInput): string[] {
  const relay = normalizeNonEmpty(input.url, 'relay URL');
  const marker = input.marker?.trim();
  return marker ? ['relay', relay, marker] : ['relay', relay];
}

export function buildNip72CommunityImageTag(input: Nip72CommunityImageInput): string[] {
  const url = normalizeNonEmpty(input.url, 'community image URL');
  const dimensions = input.dimensions?.trim();
  return dimensions ? ['image', url, dimensions] : ['image', url];
}

export function buildNip72TopLevelPostTags(
  community: Nip72CommunityPointerInput,
  tags: readonly (readonly string[])[] = []
): string[][] {
  return [
    buildNip72CommunityAddressTag(community, 'A'),
    buildNip72CommunityAddressTag(community, 'a'),
    buildNip72CommunityPubkeyTag(community, 'P'),
    buildNip72CommunityPubkeyTag(community, 'p'),
    ['K', NIP72_COMMUNITY_KIND_TEXT],
    ['k', NIP72_COMMUNITY_KIND_TEXT],
    ...copyTags(tags).filter((tag) => !COMMUNITY_POST_TAGS.has(tag[0]))
  ];
}

export function buildNip72ReplyPostTags(
  input: { readonly community: Nip72CommunityPointerInput; readonly parent: Nip72ParentPostInput },
  tags: readonly (readonly string[])[] = []
): string[][] {
  const parentEventId = normalizeNonEmpty(input.parent.eventId, 'parent event id');
  const parentPubkey = normalizeNonEmpty(input.parent.pubkey, 'parent pubkey');
  const parentRelayHint = input.parent.relayHint?.trim();
  return [
    buildNip72CommunityAddressTag(input.community, 'A'),
    buildNip72CommunityPubkeyTag(input.community, 'P'),
    ['K', NIP72_COMMUNITY_KIND_TEXT],
    parentRelayHint ? ['e', parentEventId, parentRelayHint] : ['e', parentEventId],
    parentRelayHint ? ['p', parentPubkey, parentRelayHint] : ['p', parentPubkey],
    ['k', String(input.parent.kind)],
    ...copyTags(tags).filter((tag) => !COMMUNITY_POST_TAGS.has(tag[0]))
  ];
}

export function buildNip72CommunityPost(input: BuildNip72CommunityPostInput): EventParameters {
  const tags = input.parent
    ? buildNip72ReplyPostTags({ community: input.community, parent: input.parent }, input.tags)
    : buildNip72TopLevelPostTags(input.community, input.tags);
  return {
    kind: NIP72_COMMUNITY_POST_KIND,
    content: input.content,
    tags
  };
}

export function buildNip72ApprovalEvent(input: BuildNip72ApprovalInput): EventParameters {
  if (input.communities.length === 0) {
    throw new Error('NIP-72 approval requires at least one community');
  }
  const postTags = buildNip72ApprovalPostTags(input.post);
  if (!postTags.some((tag) => tag[0] === 'e' || tag[0] === 'a')) {
    throw new Error('NIP-72 approval requires a post event id or address');
  }
  const content =
    input.content ?? (input.approvedEvent === undefined ? '' : JSON.stringify(input.approvedEvent));
  return {
    kind: NIP72_APPROVAL_KIND,
    content,
    tags: [
      ...input.communities.map((community) => buildNip72CommunityAddressTag(community, 'a')),
      ...postTags,
      ...copyTags(input.tags ?? []).filter((tag) => !APPROVAL_TAGS.has(tag[0]))
    ]
  };
}

export function parseNip72CommunityDefinition(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip72CommunityDefinitionSnapshot | null {
  if (event.kind !== NIP72_COMMUNITY_DEFINITION_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  if (!identifier) return null;
  return {
    identifier,
    name: firstTagValue(event.tags, 'name'),
    description: firstTagValue(event.tags, 'description'),
    image: parseNip72CommunityImageTag(event.tags.find((tag) => tag[0] === 'image')),
    moderators: parseNip72ModeratorTags(event.tags),
    relays: parseNip72RelayTags(event.tags),
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    customTags: copyTags(event.tags).filter((tag) => !COMMUNITY_DEFINITION_TAGS.has(tag[0]))
  };
}

export function parseNip72CommunityPost(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip72CommunityPostSnapshot | null {
  if (event.kind !== NIP72_COMMUNITY_POST_KIND) return null;
  const community = parseNip72CommunityAddressTag(event.tags.find((tag) => tag[0] === 'A'));
  if (!community) return null;
  const lowerCommunity = parseNip72CommunityAddressTag(event.tags.find((tag) => tag[0] === 'a'));
  const topLevel =
    Boolean(lowerCommunity) &&
    lowerCommunity?.value === community.value &&
    hasKindTag(event.tags, 'K', NIP72_COMMUNITY_KIND_TEXT) &&
    hasKindTag(event.tags, 'k', NIP72_COMMUNITY_KIND_TEXT);
  const parent = topLevel ? null : parseParentPost(event.tags);
  if (!topLevel && !parent) return null;

  return {
    community,
    topLevel,
    parent,
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    customTags: copyTags(event.tags).filter((tag) => !COMMUNITY_POST_TAGS.has(tag[0]))
  };
}

export function parseNip72ApprovalEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip72ApprovalSnapshot | null {
  if (event.kind !== NIP72_APPROVAL_KIND) return null;
  const communities = event.tags.flatMap((tag) => {
    const community = tag[0] === 'a' ? parseNip72CommunityAddressTag(tag) : null;
    return community ? [community] : [];
  });
  const post = parseApprovalPost(event.tags);
  if (communities.length === 0 || !post) return null;
  return {
    communities,
    post,
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    customTags: copyTags(event.tags).filter((tag) => !APPROVAL_TAGS.has(tag[0]))
  };
}

export function parseNip72CommunityAddressTag(
  tag: readonly string[] | undefined
): Nip72CommunityPointer | null {
  if (!tag || (tag[0] !== 'a' && tag[0] !== 'A')) return null;
  const [kind, pubkey, ...identifierParts] = (tag[1] ?? '').trim().split(':');
  const identifier = identifierParts.join(':').trim();
  if (kind !== NIP72_COMMUNITY_KIND_TEXT || !pubkey?.trim() || !identifier) return null;
  return {
    pubkey: pubkey.trim(),
    identifier,
    value: `${NIP72_COMMUNITY_DEFINITION_KIND}:${pubkey.trim()}:${identifier}`,
    relayHint: tag[2]?.trim() || null
  };
}

export function parseNip72ModeratorTags(tags: readonly (readonly string[])[]): Nip72Moderator[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'p' || tag[3] !== NIP72_MODERATOR_MARKER) return [];
    const pubkey = tag[1]?.trim();
    if (!pubkey) return [];
    return [{ pubkey, relayHint: tag[2]?.trim() || null }];
  });
}

export function parseNip72RelayTags(tags: readonly (readonly string[])[]): Nip72Relay[] {
  return tags.flatMap((tag) => {
    const relay = tag[0] === 'relay' ? tag[1]?.trim() : null;
    if (!relay) return [];
    return [{ url: relay, marker: tag[2]?.trim() || null }];
  });
}

export function parseNip72CommunityImageTag(
  tag: readonly string[] | undefined
): Nip72CommunityImage | null {
  const url = tag?.[0] === 'image' ? tag[1]?.trim() : null;
  if (!url) return null;
  return { url, dimensions: tag?.[2]?.trim() || null };
}

function buildNip72ApprovalPostTags(input: Nip72ApprovalPostInput): string[][] {
  assertKind(input.kind, 'post kind');
  const tags: string[][] = [];
  const eventId = input.eventId?.trim();
  if (eventId) tags.push(['e', eventId]);
  const address = input.address?.trim();
  if (address) tags.push(['a', address]);
  const authorPubkey = normalizeNonEmpty(input.authorPubkey, 'post author pubkey');
  const authorRelayHint = input.authorRelayHint?.trim();
  tags.push(authorRelayHint ? ['p', authorPubkey, authorRelayHint] : ['p', authorPubkey]);
  tags.push(['k', String(input.kind)]);
  return tags;
}

function parseParentPost(tags: readonly (readonly string[])[]): Nip72ParentPost | null {
  const eventTag = tags.find((tag) => tag[0] === 'e' && Boolean(tag[1]?.trim()));
  const pubkeyTag = tags.find((tag) => tag[0] === 'p' && Boolean(tag[1]?.trim()));
  const kindTag = tags.find((tag) => tag[0] === 'k' && Boolean(tag[1]?.trim()));
  const kind = parseKind(kindTag?.[1]);
  if (!eventTag || !pubkeyTag || kind === null) return null;
  return {
    eventId: eventTag[1].trim(),
    pubkey: pubkeyTag[1].trim(),
    kind,
    relayHint: eventTag[2]?.trim() || pubkeyTag[2]?.trim() || null
  };
}

function parseApprovalPost(tags: readonly (readonly string[])[]): Nip72ApprovalPost | null {
  const eventId = firstTagValue(tags, 'e');
  const postAddress =
    tags
      .filter((tag) => tag[0] === 'a')
      .map((tag) => tag[1]?.trim())
      .find((value) => value && !value.startsWith(`${NIP72_COMMUNITY_DEFINITION_KIND}:`)) ?? null;
  if (!eventId && !postAddress) return null;
  const authorPubkey = firstTagValue(tags, 'p');
  const kind = parseKind(firstTagValue(tags, 'k'));
  if (!authorPubkey || kind === null) return null;
  const authorRelayHint = tags.find(
    (tag) => tag[0] === 'p' && tag[1]?.trim() === authorPubkey
  )?.[2];
  return {
    eventId,
    address: postAddress,
    authorPubkey,
    authorRelayHint: authorRelayHint?.trim() || null,
    kind
  };
}

function hasKindTag(
  tags: readonly (readonly string[])[],
  tagName: 'K' | 'k',
  value: string
): boolean {
  return tags.some((tag) => tag[0] === tagName && tag[1] === value);
}

function appendOptionalTag(
  tags: string[][],
  tagName: string,
  value: string | null | undefined
): void {
  const normalized = value?.trim();
  if (normalized) tags.push([tagName, normalized]);
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value || null;
}

function parseKind(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const kind = Number(value);
  return Number.isSafeInteger(kind) ? kind : null;
}

function assertKind(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`NIP-72 ${label} must be a non-negative safe integer`);
  }
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-72 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
