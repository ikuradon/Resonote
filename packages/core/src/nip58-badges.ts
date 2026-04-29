import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

export const NIP58_BADGE_AWARD_KIND = 8;
export const NIP58_PROFILE_BADGES_KIND = 10008;
export const NIP58_BADGE_SET_KIND = 30008;
export const NIP58_BADGE_DEFINITION_KIND = 30009;
export const NIP58_DEPRECATED_PROFILE_BADGES_IDENTIFIER = 'profile_badges';
export const NIP58_BADGE_IMAGE_RECOMMENDED_DIMENSIONS = '1024x1024';
export const NIP58_THUMB_RECOMMENDED_DIMENSIONS = [
  '512x512',
  '256x256',
  '64x64',
  '32x32',
  '16x16'
] as const;

export interface Nip58BadgeDefinitionPointerInput {
  readonly pubkey: string;
  readonly identifier: string;
  readonly relayHint?: string | null;
}

export interface Nip58BadgeDefinitionPointer {
  readonly pubkey: string;
  readonly identifier: string;
  readonly value: string;
  readonly relayHint: string | null;
}

export interface Nip58AwardEventPointerInput {
  readonly eventId: string;
  readonly relayHint?: string | null;
}

export interface Nip58AwardEventPointer {
  readonly eventId: string;
  readonly relayHint: string | null;
}

export interface Nip58BadgeImageInput {
  readonly url: string;
  readonly dimensions?: string | null;
}

export interface Nip58BadgeImage {
  readonly url: string;
  readonly dimensions: string | null;
}

export interface Nip58AwardedPubkeyInput {
  readonly pubkey: string;
  readonly relayHint?: string | null;
}

export interface Nip58AwardedPubkey {
  readonly pubkey: string;
  readonly relayHint: string | null;
}

export interface Nip58BadgePairInput {
  readonly badge: Nip58BadgeDefinitionPointerInput;
  readonly award: Nip58AwardEventPointerInput;
}

export interface Nip58BadgePair {
  readonly badge: Nip58BadgeDefinitionPointer;
  readonly award: Nip58AwardEventPointer;
}

export interface BuildNip58BadgeDefinitionInput {
  readonly identifier: string;
  readonly content?: string;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly image?: Nip58BadgeImageInput | null;
  readonly thumbs?: readonly Nip58BadgeImageInput[];
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip58BadgeAwardInput {
  readonly badge: Nip58BadgeDefinitionPointerInput;
  readonly awardedPubkeys: readonly Nip58AwardedPubkeyInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip58ProfileBadgesInput {
  readonly badges?: readonly Nip58BadgePairInput[];
  readonly badgeSets?: readonly Nip58BadgeDefinitionPointerInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip58BadgeSetInput extends BuildNip58ProfileBadgesInput {
  readonly identifier: string;
  readonly title?: string | null;
  readonly image?: string | null;
  readonly description?: string | null;
}

export interface Nip58BadgeDefinitionSnapshot {
  readonly identifier: string;
  readonly content: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly image: Nip58BadgeImage | null;
  readonly thumbs: readonly Nip58BadgeImage[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip58BadgeAwardSnapshot {
  readonly badge: Nip58BadgeDefinitionPointer;
  readonly awardedPubkeys: readonly Nip58AwardedPubkey[];
  readonly content: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export interface Nip58ProfileBadgesSnapshot {
  readonly kind: typeof NIP58_PROFILE_BADGES_KIND | typeof NIP58_BADGE_SET_KIND;
  readonly deprecated: boolean;
  readonly identifier: string | null;
  readonly content: string;
  readonly badges: readonly Nip58BadgePair[];
  readonly badgeSets: readonly Nip58BadgeDefinitionPointer[];
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

const BADGE_DEFINITION_TAGS = new Set(['d', 'name', 'description', 'image', 'thumb']);
const BADGE_AWARD_TAGS = new Set(['a', 'p']);
const BADGE_PROFILE_TAGS = new Set(['a', 'e']);
const BADGE_SET_TAGS = new Set(['d', 'title', 'image', 'description', 'a', 'e']);

export function buildNip58BadgeDefinition(input: BuildNip58BadgeDefinitionInput): EventParameters {
  const tags: string[][] = [['d', normalizeNonEmpty(input.identifier, 'badge identifier')]];
  appendOptionalTag(tags, 'name', input.name);
  appendOptionalTag(tags, 'description', input.description);
  if (input.image) tags.push(buildNip58ImageTag('image', input.image));
  tags.push(...(input.thumbs ?? []).map((thumb) => buildNip58ImageTag('thumb', thumb)));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !BADGE_DEFINITION_TAGS.has(tag[0])));

  return {
    kind: NIP58_BADGE_DEFINITION_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip58BadgeAward(input: BuildNip58BadgeAwardInput): EventParameters {
  if (input.awardedPubkeys.length === 0) {
    throw new Error('NIP-58 badge award requires at least one awarded pubkey');
  }

  return {
    kind: NIP58_BADGE_AWARD_KIND,
    content: input.content ?? '',
    tags: [
      buildNip58BadgeDefinitionTag(input.badge),
      ...input.awardedPubkeys.map(buildNip58AwardedPubkeyTag),
      ...copyTags(input.tags ?? []).filter((tag) => !BADGE_AWARD_TAGS.has(tag[0]))
    ]
  };
}

export function buildNip58ProfileBadges(input: BuildNip58ProfileBadgesInput = {}): EventParameters {
  return {
    kind: NIP58_PROFILE_BADGES_KIND,
    content: input.content ?? '',
    tags: [
      ...buildNip58BadgePairTags(input.badges ?? []),
      ...(input.badgeSets ?? []).map(buildNip58BadgeSetReferenceTag),
      ...copyTags(input.tags ?? []).filter((tag) => !BADGE_PROFILE_TAGS.has(tag[0]))
    ]
  };
}

export function buildNip58BadgeSet(input: BuildNip58BadgeSetInput): EventParameters {
  const tags: string[][] = [['d', normalizeNonEmpty(input.identifier, 'badge set identifier')]];
  appendOptionalTag(tags, 'title', input.title);
  appendOptionalTag(tags, 'image', input.image);
  appendOptionalTag(tags, 'description', input.description);
  tags.push(...buildNip58BadgePairTags(input.badges ?? []));
  tags.push(...copyTags(input.tags ?? []).filter((tag) => !BADGE_SET_TAGS.has(tag[0])));

  return {
    kind: NIP58_BADGE_SET_KIND,
    content: input.content ?? '',
    tags
  };
}

export function buildNip58BadgeDefinitionTag(input: Nip58BadgeDefinitionPointerInput): string[] {
  const value = `${NIP58_BADGE_DEFINITION_KIND}:${normalizeNonEmpty(
    input.pubkey,
    'badge issuer pubkey'
  )}:${normalizeNonEmpty(input.identifier, 'badge identifier')}`;
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['a', value, relayHint] : ['a', value];
}

export function buildNip58BadgeSetReferenceTag(input: Nip58BadgeDefinitionPointerInput): string[] {
  const value = `${NIP58_BADGE_SET_KIND}:${normalizeNonEmpty(
    input.pubkey,
    'badge set pubkey'
  )}:${normalizeNonEmpty(input.identifier, 'badge set identifier')}`;
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['a', value, relayHint] : ['a', value];
}

export function buildNip58AwardEventTag(input: Nip58AwardEventPointerInput): string[] {
  const eventId = normalizeNonEmpty(input.eventId, 'badge award event id');
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['e', eventId, relayHint] : ['e', eventId];
}

export function buildNip58AwardedPubkeyTag(input: Nip58AwardedPubkeyInput): string[] {
  const pubkey = normalizeNonEmpty(input.pubkey, 'awarded pubkey');
  const relayHint = input.relayHint?.trim();
  return relayHint ? ['p', pubkey, relayHint] : ['p', pubkey];
}

export function parseNip58BadgeDefinition(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip58BadgeDefinitionSnapshot | null {
  if (event.kind !== NIP58_BADGE_DEFINITION_KIND) return null;
  const identifier = firstTagValue(event.tags, 'd');
  if (!identifier) return null;

  return {
    identifier,
    content: event.content,
    name: firstTagValue(event.tags, 'name'),
    description: firstTagValue(event.tags, 'description'),
    image: parseNip58ImageTag(event.tags.find((tag) => tag[0] === 'image')),
    thumbs: event.tags.flatMap((tag) => {
      const thumb = parseNip58ImageTag(tag[0] === 'thumb' ? tag : null);
      return thumb ? [thumb] : [];
    }),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip58BadgeAward(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip58BadgeAwardSnapshot | null {
  if (event.kind !== NIP58_BADGE_AWARD_KIND) return null;
  const badge = parseNip58BadgeDefinitionTags(event.tags)[0];
  const awardedPubkeys = parseNip58AwardedPubkeyTags(event.tags);
  if (!badge || awardedPubkeys.length === 0) return null;

  return {
    badge,
    awardedPubkeys,
    content: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip58ProfileBadges(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip58ProfileBadgesSnapshot | null {
  const deprecated =
    event.kind === NIP58_BADGE_SET_KIND &&
    firstTagValue(event.tags, 'd') === NIP58_DEPRECATED_PROFILE_BADGES_IDENTIFIER;
  if (event.kind !== NIP58_PROFILE_BADGES_KIND && !deprecated) return null;

  return {
    kind: event.kind as typeof NIP58_PROFILE_BADGES_KIND | typeof NIP58_BADGE_SET_KIND,
    deprecated,
    identifier: firstTagValue(event.tags, 'd'),
    content: event.content,
    badges: parseNip58BadgePairs(event.tags),
    badgeSets: parseNip58BadgeSetReferenceTags(event.tags),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip58BadgeSet(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip58ProfileBadgesSnapshot | null {
  if (
    event.kind !== NIP58_BADGE_SET_KIND ||
    firstTagValue(event.tags, 'd') === NIP58_DEPRECATED_PROFILE_BADGES_IDENTIFIER
  ) {
    return null;
  }
  const identifier = firstTagValue(event.tags, 'd');
  if (!identifier) return null;

  return {
    kind: NIP58_BADGE_SET_KIND,
    deprecated: false,
    identifier,
    content: event.content,
    badges: parseNip58BadgePairs(event.tags),
    badgeSets: [],
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function parseNip58BadgePairs(tags: readonly (readonly string[])[]): Nip58BadgePair[] {
  const pairs: Nip58BadgePair[] = [];
  for (let index = 0; index < tags.length - 1; index += 1) {
    if (tags[index][0] !== 'a' || tags[index + 1][0] !== 'e') continue;
    const badge = parseNip58BadgeDefinitionTag(tags[index]);
    const award = parseNip58AwardEventTag(tags[index + 1]);
    if (badge && award) pairs.push({ badge, award });
  }
  return pairs;
}

export function parseNip58BadgeDefinitionTags(
  tags: readonly (readonly string[])[]
): Nip58BadgeDefinitionPointer[] {
  return tags.flatMap((tag) => {
    const badge = parseNip58BadgeDefinitionTag(tag);
    return badge ? [badge] : [];
  });
}

export function parseNip58BadgeDefinitionTag(
  tag: readonly string[]
): Nip58BadgeDefinitionPointer | null {
  if (tag[0] !== 'a') return null;
  return parseNip58AddressPointer(tag[1] ?? '', NIP58_BADGE_DEFINITION_KIND, tag[2]);
}

export function parseNip58BadgeSetReferenceTags(
  tags: readonly (readonly string[])[]
): Nip58BadgeDefinitionPointer[] {
  return tags.flatMap((tag) => {
    if (tag[0] !== 'a') return [];
    const badgeSet = parseNip58AddressPointer(tag[1] ?? '', NIP58_BADGE_SET_KIND, tag[2]);
    return badgeSet ? [badgeSet] : [];
  });
}

export function parseNip58AwardEventTag(tag: readonly string[]): Nip58AwardEventPointer | null {
  const eventId = tag[0] === 'e' ? tag[1]?.trim() : null;
  if (!eventId) return null;
  return {
    eventId,
    relayHint: tag[2]?.trim() || null
  };
}

export function parseNip58AwardedPubkeyTags(
  tags: readonly (readonly string[])[]
): Nip58AwardedPubkey[] {
  return tags.flatMap((tag) => {
    const pubkey = tag[0] === 'p' ? tag[1]?.trim() : null;
    if (!pubkey) return [];
    return [
      {
        pubkey,
        relayHint: tag[2]?.trim() || null
      }
    ];
  });
}

function buildNip58BadgePairTags(pairs: readonly Nip58BadgePairInput[]): string[][] {
  return pairs.flatMap((pair) => [
    buildNip58BadgeDefinitionTag(pair.badge),
    buildNip58AwardEventTag(pair.award)
  ]);
}

function buildNip58ImageTag(tagName: 'image' | 'thumb', input: Nip58BadgeImageInput): string[] {
  const url = normalizeNonEmpty(input.url, `${tagName} URL`);
  const dimensions = input.dimensions?.trim();
  return dimensions ? [tagName, url, dimensions] : [tagName, url];
}

function parseNip58ImageTag(tag: readonly string[] | null | undefined): Nip58BadgeImage | null {
  const url = tag?.[1]?.trim();
  if (!url) return null;
  return {
    url,
    dimensions: tag?.[2]?.trim() || null
  };
}

function parseNip58AddressPointer(
  value: string,
  expectedKind: typeof NIP58_BADGE_DEFINITION_KIND | typeof NIP58_BADGE_SET_KIND,
  relayHint?: string | null
): Nip58BadgeDefinitionPointer | null {
  const parts = value.trim().split(':');
  if (parts.length < 3) return null;
  const kind = Number(parts[0]);
  const pubkey = parts[1]?.trim();
  const identifier = parts.slice(2).join(':').trim();
  if (kind !== expectedKind || !pubkey || !identifier) return null;
  return {
    pubkey,
    identifier,
    value: `${kind}:${pubkey}:${identifier}`,
    relayHint: relayHint?.trim() || null
  };
}

function appendOptionalTag(
  tags: string[][],
  tagName: string,
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

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-58 ${label} must not be empty`);
  return normalized;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
