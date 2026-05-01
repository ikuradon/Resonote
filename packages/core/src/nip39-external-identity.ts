import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

import type { Filter } from './relay-request.js';

export const NIP39_EXTERNAL_IDENTITIES_KIND = 10011;
export const NIP39_IDENTITY_TAG = 'i';
export const NIP39_KNOWN_PLATFORMS = ['github', 'twitter', 'mastodon', 'telegram'] as const;
export const NIP39_PLATFORM_NAME_PATTERN = /^[a-z0-9._/-]+$/;

export type Nip39KnownPlatform = (typeof NIP39_KNOWN_PLATFORMS)[number];
export type Nip39Platform = Nip39KnownPlatform | string;

export interface Nip39IdentityClaim {
  readonly platform: string;
  readonly identity: string;
  readonly value: string;
}

export interface Nip39ExternalIdentityInput {
  readonly platform: Nip39Platform;
  readonly identity: string;
  readonly proof: string;
  readonly extra?: readonly string[];
}

export interface Nip39ExternalIdentity {
  readonly platform: string;
  readonly identity: string;
  readonly value: string;
  readonly proof: string;
  readonly proofUrl: string | null;
  readonly extra: readonly string[];
  readonly knownPlatform: boolean;
}

export interface BuildNip39ExternalIdentitiesEventInput {
  readonly identities: readonly Nip39ExternalIdentityInput[];
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface BuildNip39ExternalIdentitiesFilterInput {
  readonly authors?: readonly string[];
  readonly identityClaims?: readonly (Nip39IdentityClaim | Nip39ExternalIdentityInput | string)[];
  readonly limit?: number | null;
}

export interface Nip39ExternalIdentitiesSnapshot {
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly content: string;
  readonly identities: readonly Nip39ExternalIdentity[];
  readonly customTags: readonly string[][];
}

const KNOWN_PLATFORMS = new Set<string>(NIP39_KNOWN_PLATFORMS);

export function buildNip39ExternalIdentityTag(input: Nip39ExternalIdentityInput): string[] {
  const claim = buildNip39IdentityClaim(input.platform, input.identity);
  const proof = normalizeNonEmpty(input.proof, 'proof');
  return [NIP39_IDENTITY_TAG, claim, proof, ...normalizeExtraValues(input.extra ?? [])];
}

export function buildNip39ExternalIdentitiesEvent(
  input: BuildNip39ExternalIdentitiesEventInput
): EventParameters {
  if (input.identities.length === 0) {
    throw new Error('NIP-39 external identities event requires at least one identity');
  }

  return {
    kind: NIP39_EXTERNAL_IDENTITIES_KIND,
    content: input.content ?? '',
    tags: [
      ...input.identities.map(buildNip39ExternalIdentityTag),
      ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== NIP39_IDENTITY_TAG)
    ]
  };
}

export function buildNip39ExternalIdentitiesFilter(
  input: BuildNip39ExternalIdentitiesFilterInput = {}
): Filter {
  const filter: Filter = { kinds: [NIP39_EXTERNAL_IDENTITIES_KIND] };
  const authors = normalizeOptionalStringList(input.authors);
  const identityClaims = normalizeOptionalStringList(
    (input.identityClaims ?? []).map((claim) => normalizeNip39FilterClaim(claim))
  );

  if (authors.length > 0) filter.authors = authors;
  if (identityClaims.length > 0) filter['#i'] = identityClaims;
  if (input.limit !== undefined && input.limit !== null) {
    assertPositiveSafeInteger(input.limit, 'filter limit');
    filter.limit = input.limit;
  }

  return filter;
}

export function parseNip39ExternalIdentitiesEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip39ExternalIdentitiesSnapshot | null {
  if (event.kind !== NIP39_EXTERNAL_IDENTITIES_KIND) return null;
  const identities = parseNip39ExternalIdentityTags(event.tags);
  if (identities.length === 0) return null;

  return {
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    content: event.content,
    identities,
    customTags: copyTags(event.tags).filter((tag) => tag[0] !== NIP39_IDENTITY_TAG)
  };
}

export function parseNip39ExternalIdentityTags(
  tags: readonly (readonly string[])[]
): Nip39ExternalIdentity[] {
  return tags.flatMap((tag) => {
    const identity = parseNip39ExternalIdentityTag(tag);
    return identity ? [identity] : [];
  });
}

export function parseNip39ExternalIdentityTag(
  tag: readonly string[]
): Nip39ExternalIdentity | null {
  if (tag[0] !== NIP39_IDENTITY_TAG) return null;
  const claim = parseNip39IdentityClaim(tag[1] ?? '');
  const proof = tag[2]?.trim();
  if (!claim || !proof) return null;

  const identity = {
    platform: claim.platform,
    identity: claim.identity,
    value: claim.value,
    proof,
    proofUrl: null,
    extra: tag
      .slice(3)
      .map((value) => value.trim())
      .filter(Boolean),
    knownPlatform: isNip39KnownPlatform(claim.platform)
  };

  return {
    ...identity,
    proofUrl: buildNip39ProofUrl(identity)
  };
}

export function buildNip39IdentityClaim(platform: Nip39Platform, identity: string): string {
  return `${normalizeNip39PlatformName(platform)}:${normalizeNonEmpty(identity, 'identity')}`;
}

export function parseNip39IdentityClaim(value: string): Nip39IdentityClaim | null {
  const normalized = value.trim();
  const separatorIndex = normalized.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) return null;

  const platform = normalized.slice(0, separatorIndex).trim().toLowerCase();
  const identity = normalized.slice(separatorIndex + 1).trim();
  if (!isNip39PlatformName(platform) || !identity) return null;

  return {
    platform,
    identity,
    value: `${platform}:${identity}`
  };
}

export function buildNip39ProofUrl(
  identity: Pick<Nip39ExternalIdentity, 'platform' | 'identity' | 'proof'>
): string | null {
  if (identity.platform === 'github') {
    return `https://gist.github.com/${identity.identity}/${identity.proof}`;
  }
  if (identity.platform === 'twitter') {
    return `https://twitter.com/${identity.identity}/status/${identity.proof}`;
  }
  if (identity.platform === 'mastodon') {
    return `https://${identity.identity}/${identity.proof}`;
  }
  if (identity.platform === 'telegram') {
    return `https://t.me/${identity.proof}`;
  }
  return null;
}

export function normalizeNip39PlatformName(platform: string): string {
  const normalized = normalizeNonEmpty(platform, 'platform').toLowerCase();
  if (!isNip39PlatformName(normalized)) {
    throw new Error(`NIP-39 platform name must match ${NIP39_PLATFORM_NAME_PATTERN}`);
  }
  return normalized;
}

export function normalizeNip39IdentityName(identity: string): string {
  return normalizeNonEmpty(identity, 'identity').toLowerCase();
}

export function isNip39ExternalIdentitiesEvent(event: Pick<NostrEvent, 'kind'>): boolean {
  return event.kind === NIP39_EXTERNAL_IDENTITIES_KIND;
}

export function isNip39KnownPlatform(value: string): value is Nip39KnownPlatform {
  return KNOWN_PLATFORMS.has(value);
}

export function isNip39PlatformName(value: string): boolean {
  return NIP39_PLATFORM_NAME_PATTERN.test(value);
}

function normalizeNip39FilterClaim(
  claim: Nip39IdentityClaim | Nip39ExternalIdentityInput | string
): string {
  if (typeof claim === 'string') {
    const parsed = parseNip39IdentityClaim(claim);
    if (!parsed) throw new Error('NIP-39 identity claim must be platform:identity');
    return parsed.value;
  }
  return buildNip39IdentityClaim(claim.platform, claim.identity);
}

function normalizeNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`NIP-39 ${label} must not be empty`);
  return normalized;
}

function normalizeOptionalStringList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeExtraValues(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`NIP-39 ${label} must be a positive safe integer`);
  }
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
