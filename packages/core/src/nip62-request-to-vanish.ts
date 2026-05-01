import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

import { normalizeRelayUrl } from './relay-selection.js';

export const NIP62_REQUEST_TO_VANISH_KIND = 62;
export const NIP62_RELAY_TAG = 'relay';
export const NIP62_ALL_RELAYS = 'ALL_RELAYS';

export interface BuildNip62RequestToVanishInput {
  readonly relayUrls: readonly string[] | typeof NIP62_ALL_RELAYS;
  readonly content?: string;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip62RequestToVanishSnapshot {
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly content: string;
  readonly relayTargets: readonly string[];
  readonly global: boolean;
  readonly customTags: readonly string[][];
}

export function buildNip62RequestToVanishEvent(
  input: BuildNip62RequestToVanishInput
): EventParameters {
  const relayTargets = normalizeNip62RelayTargets(input.relayUrls);
  return {
    kind: NIP62_REQUEST_TO_VANISH_KIND,
    content: input.content ?? '',
    tags: [
      ...relayTargets.map((relay) => [NIP62_RELAY_TAG, relay]),
      ...copyTags(input.tags ?? []).filter((tag) => tag[0] !== NIP62_RELAY_TAG)
    ]
  };
}

export function parseNip62RequestToVanishEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip62RequestToVanishSnapshot | null {
  if (event.kind !== NIP62_REQUEST_TO_VANISH_KIND) return null;

  const relayTargets = parseNip62RelayTargets(event.tags);
  if (relayTargets.length === 0) return null;

  return {
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    content: event.content,
    relayTargets,
    global: relayTargets.includes(NIP62_ALL_RELAYS),
    customTags: event.tags.filter((tag) => tag[0] !== NIP62_RELAY_TAG).map((tag) => [...tag])
  };
}

export function parseNip62RelayTargets(tags: readonly (readonly string[])[]): string[] {
  return [
    ...new Set(
      tags
        .filter((tag) => tag[0] === NIP62_RELAY_TAG)
        .map((tag) => normalizeNip62RelayTarget(tag[1]))
        .filter((relay): relay is string => relay !== null)
    )
  ];
}

export function nip62TargetsRelay(
  snapshot: Pick<Nip62RequestToVanishSnapshot, 'relayTargets' | 'global'>,
  relayUrl: string
): boolean {
  if (snapshot.global) return true;
  const normalized = normalizeRelayUrl(relayUrl);
  return normalized !== null && snapshot.relayTargets.includes(normalized);
}

export function isNip62RequestToVanishEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'>
): boolean {
  return parseNip62RequestToVanishEvent(event) !== null;
}

function normalizeNip62RelayTargets(
  relayUrls: readonly string[] | typeof NIP62_ALL_RELAYS
): string[] {
  if (relayUrls === NIP62_ALL_RELAYS) return [NIP62_ALL_RELAYS];

  const targets = [
    ...new Set(
      relayUrls.map(normalizeNip62RelayTarget).filter((relay): relay is string => relay !== null)
    )
  ];
  if (targets.length === 0) {
    throw new Error('NIP-62 request to vanish must include at least one relay target');
  }
  return targets;
}

function normalizeNip62RelayTarget(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed === NIP62_ALL_RELAYS) return NIP62_ALL_RELAYS;
  return normalizeRelayUrl(trimmed);
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
