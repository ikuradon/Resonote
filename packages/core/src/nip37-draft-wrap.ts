import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';

import { buildNip40ExpirationTag, parseNip40Expiration } from './nip40-expiration.js';
import { normalizeRelayUrl } from './relay-selection.js';
import type { EventSigner, UnsignedEvent } from './relay-session.js';

export const NIP37_DRAFT_WRAP_KIND = 31234;
export const NIP37_PRIVATE_RELAY_LIST_KIND = 10013;

export interface Nip37DraftWrapCrypto {
  encryptDraft(plaintextDraftJson: string, signerPubkey: string): Promise<string> | string;
}

export interface BuildNip37DraftWrapInput {
  readonly draft: UnsignedEvent;
  readonly encryptedContent: string;
  readonly identifier?: string;
  readonly expiration?: number;
  readonly createdAt?: number;
  readonly tags?: readonly (readonly string[])[];
}

export interface EncryptNip37DraftWrapInput extends Omit<
  BuildNip37DraftWrapInput,
  'encryptedContent'
> {
  readonly signer: EventSigner;
  readonly crypto: Nip37DraftWrapCrypto;
}

export interface BuildNip37DraftDeletionInput {
  readonly draftKind: number;
  readonly identifier?: string;
  readonly expiration?: number;
  readonly createdAt?: number;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip37DraftWrapSnapshot {
  readonly identifier: string;
  readonly draftKind: number;
  readonly encryptedContent: string | null;
  readonly deleted: boolean;
  readonly expiration: number | null;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
  readonly tags: readonly string[][];
  readonly customTags: readonly string[][];
}

export interface BuildNip37PrivateRelayListInput {
  readonly encryptedContent: string;
  readonly createdAt?: number;
  readonly tags?: readonly (readonly string[])[];
}

export interface Nip37PrivateRelayListSnapshot {
  readonly encryptedContent: string;
  readonly pubkey: string | null;
  readonly createdAt: number | null;
}

export async function encryptNip37DraftWrap(
  input: EncryptNip37DraftWrapInput
): Promise<EventParameters> {
  const signerPubkey = await input.signer.getPublicKey();
  return buildNip37DraftWrapEvent({
    ...input,
    encryptedContent: await input.crypto.encryptDraft(JSON.stringify(input.draft), signerPubkey)
  });
}

export function buildNip37DraftWrapEvent(input: BuildNip37DraftWrapInput): EventParameters {
  return {
    kind: NIP37_DRAFT_WRAP_KIND,
    created_at: input.createdAt,
    content: input.encryptedContent,
    tags: buildDraftWrapTags({
      draftKind: input.draft.kind,
      identifier: input.identifier,
      expiration: input.expiration,
      tags: input.tags
    })
  };
}

export function buildNip37DraftDeletionEvent(input: BuildNip37DraftDeletionInput): EventParameters {
  return {
    kind: NIP37_DRAFT_WRAP_KIND,
    created_at: input.createdAt,
    content: '',
    tags: buildDraftWrapTags(input)
  };
}

export function parseNip37DraftWrapEvent(
  event: Pick<NostrEvent, 'kind' | 'tags' | 'content'> &
    Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip37DraftWrapSnapshot | null {
  if (event.kind !== NIP37_DRAFT_WRAP_KIND) return null;

  const draftKind = parseDraftKind(event.tags);
  if (draftKind === null) return null;

  const tags = copyTags(event.tags);
  const deleted = event.content === '';
  return {
    identifier: firstTagValue(event.tags, 'd') ?? '',
    draftKind,
    encryptedContent: deleted ? null : event.content,
    deleted,
    expiration: parseNip40Expiration({ tags }),
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null,
    tags,
    customTags: tags.filter((tag) => !['d', 'k', 'expiration'].includes(tag[0]))
  };
}

export function buildNip37PrivateRelayListEvent(
  input: BuildNip37PrivateRelayListInput
): EventParameters {
  return {
    kind: NIP37_PRIVATE_RELAY_LIST_KIND,
    created_at: input.createdAt,
    content: input.encryptedContent,
    tags: copyTags(input.tags ?? [])
  };
}

export function parseNip37PrivateRelayListEvent(
  event: Pick<NostrEvent, 'kind' | 'content'> & Partial<Pick<NostrEvent, 'pubkey' | 'created_at'>>
): Nip37PrivateRelayListSnapshot | null {
  if (event.kind !== NIP37_PRIVATE_RELAY_LIST_KIND) return null;
  return {
    encryptedContent: event.content,
    pubkey: event.pubkey ?? null,
    createdAt: event.created_at ?? null
  };
}

export function stringifyNip37PrivateRelayTags(relays: readonly string[]): string {
  return JSON.stringify(relaysToPrivateRelayTags(relays));
}

export function parseNip37PrivateRelayTagsJson(plaintext: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (!Array.isArray(parsed)) return null;
    const tags: string[][] = [];
    for (const item of parsed) {
      if (!Array.isArray(item) || item.some((value) => typeof value !== 'string')) return null;
      tags.push([...item]);
    }
    return parseNip37PrivateRelayTags(tags);
  } catch {
    return null;
  }
}

export function parseNip37PrivateRelayTags(tags: readonly (readonly string[])[]): string[] {
  const relays: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag[0] !== 'relay' || typeof tag[1] !== 'string') continue;
    const relay = normalizeRelayUrl(tag[1]);
    if (!relay || seen.has(relay)) continue;
    seen.add(relay);
    relays.push(relay);
  }
  return relays;
}

function buildDraftWrapTags(input: {
  readonly draftKind: number;
  readonly identifier?: string;
  readonly expiration?: number;
  readonly tags?: readonly (readonly string[])[];
}): string[][] {
  assertDraftKind(input.draftKind);
  const tags: string[][] = [
    ['d', input.identifier?.trim() ?? ''],
    ['k', String(input.draftKind)]
  ];
  if (input.expiration !== undefined) tags.push(buildNip40ExpirationTag(input.expiration));
  tags.push(
    ...copyTags(input.tags ?? []).filter((tag) => !['d', 'k', 'expiration'].includes(tag[0]))
  );
  return tags;
}

function relaysToPrivateRelayTags(relays: readonly string[]): string[][] {
  return parseNip37PrivateRelayTags(relays.map((relay) => ['relay', relay])).map((relay) => [
    'relay',
    relay
  ]);
}

function parseDraftKind(tags: readonly (readonly string[])[]): number | null {
  const raw = firstTagValue(tags, 'k');
  if (!raw || !/^\d+$/.test(raw)) return null;
  const kind = Number(raw);
  return Number.isSafeInteger(kind) ? kind : null;
}

function assertDraftKind(kind: number): void {
  if (!Number.isSafeInteger(kind) || kind < 0) {
    throw new Error('NIP-37 draft kind must be a non-negative safe integer');
  }
}

function firstTagValue(tags: readonly (readonly string[])[], tagName: string): string | null {
  const value = tags.find((tag) => tag[0] === tagName)?.[1]?.trim();
  return value ?? null;
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}
