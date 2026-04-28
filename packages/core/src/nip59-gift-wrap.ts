import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey } from './crypto.js';
import type { EventSigner, SignedEventShape, UnsignedEvent } from './relay-session.js';
import type { SignedNostrEvent, UnsignedNostrEvent } from './vocabulary.js';

export const NIP59_SEAL_KIND = 13;
export const NIP59_GIFT_WRAP_KIND = 1059;
export const NIP59_RANDOM_TIMESTAMP_WINDOW_SECONDS = 2 * 24 * 60 * 60;

export interface Nip59Rumor extends UnsignedNostrEvent {
  readonly id: string;
  readonly pubkey: string;
}

export interface Nip59SealEvent extends SignedNostrEvent {
  readonly kind: typeof NIP59_SEAL_KIND;
  readonly tags: [];
}

export interface Nip59GiftWrapEvent extends SignedNostrEvent {
  readonly kind: typeof NIP59_GIFT_WRAP_KIND;
}

export interface Nip59GiftWrapCrypto {
  encryptSeal(plaintextRumorJson: string, recipientPubkey: string): Promise<string> | string;
  encryptWrap(
    plaintextSealJson: string,
    ephemeralSecretKey: Uint8Array,
    recipientPubkey: string
  ): Promise<string> | string;
}

export interface BuildNip59GiftWrapInput {
  readonly rumor: UnsignedEvent;
  readonly recipientPubkey: string;
  readonly signer: EventSigner;
  readonly crypto: Nip59GiftWrapCrypto;
  readonly wrapTags?: readonly (readonly string[])[];
  readonly now?: () => number;
  readonly random?: () => number;
  readonly generateEphemeralSecretKey?: () => Uint8Array;
}

export interface Nip59GiftWrapResult {
  readonly rumor: Nip59Rumor;
  readonly seal: Nip59SealEvent;
  readonly giftWrap: Nip59GiftWrapEvent;
  readonly ephemeralPubkey: string;
}

export async function buildNip59GiftWrap(
  input: BuildNip59GiftWrapInput
): Promise<Nip59GiftWrapResult> {
  const authorPubkey = await input.signer.getPublicKey();
  const rumor = buildNip59Rumor(input.rumor, authorPubkey);
  const sealContent = await input.crypto.encryptSeal(JSON.stringify(rumor), input.recipientPubkey);
  const seal = await signNip59Seal(
    {
      kind: NIP59_SEAL_KIND,
      content: sealContent,
      created_at: randomizeNip59Timestamp(input.now, input.random),
      tags: []
    },
    input.signer,
    authorPubkey
  );

  const ephemeralSecretKey = input.generateEphemeralSecretKey?.() ?? generateSecretKey();
  const wrapContent = await input.crypto.encryptWrap(
    JSON.stringify(seal),
    ephemeralSecretKey,
    input.recipientPubkey
  );
  const giftWrap = finalizeEvent(
    {
      kind: NIP59_GIFT_WRAP_KIND,
      content: wrapContent,
      created_at: randomizeNip59Timestamp(input.now, input.random),
      tags: normalizeGiftWrapTags(input.recipientPubkey, input.wrapTags ?? [])
    },
    ephemeralSecretKey
  ) as Nip59GiftWrapEvent;

  return {
    rumor,
    seal,
    giftWrap,
    ephemeralPubkey: getPublicKey(ephemeralSecretKey)
  };
}

export function buildNip59Rumor(event: UnsignedEvent, pubkey: string): Nip59Rumor {
  const rumor = {
    kind: event.kind,
    content: event.content,
    tags: copyTags(event.tags),
    created_at: event.created_at,
    pubkey
  };
  return {
    ...rumor,
    id: getEventHash(rumor)
  };
}

export function parseNip59RumorJson(value: string): Nip59Rumor | null {
  try {
    const parsed = JSON.parse(value) as Partial<Nip59Rumor> & { sig?: unknown };
    if (parsed.sig !== undefined) return null;
    const parsedId = parsed.id;
    if (!isUnsignedEventShape(parsed) || typeof parsedId !== 'string') return null;
    const id = getEventHash({
      kind: parsed.kind,
      content: parsed.content,
      tags: parsed.tags,
      created_at: parsed.created_at,
      pubkey: parsed.pubkey
    });
    if (id !== parsedId) return null;
    return {
      kind: parsed.kind,
      content: parsed.content,
      tags: copyTags(parsed.tags),
      created_at: parsed.created_at,
      pubkey: parsed.pubkey,
      id: parsedId
    };
  } catch {
    return null;
  }
}

export function parseNip59SealJson(value: string): Nip59SealEvent | null {
  try {
    const parsed = JSON.parse(value) as Partial<SignedNostrEvent>;
    if (!isSignedEventShape(parsed)) return null;
    return isNip59SealEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isNip59SealEvent(
  event: Pick<SignedNostrEvent, 'kind' | 'tags'>
): event is Nip59SealEvent {
  return event.kind === NIP59_SEAL_KIND && event.tags.length === 0;
}

export function isNip59GiftWrapEvent(
  event: Pick<SignedNostrEvent, 'kind' | 'tags'>,
  recipientPubkey?: string
): boolean {
  if (event.kind !== NIP59_GIFT_WRAP_KIND) return false;
  if (recipientPubkey === undefined) return true;
  return event.tags.some((tag) => tag[0] === 'p' && tag[1] === recipientPubkey);
}

export function randomizeNip59Timestamp(
  now: (() => number) | undefined = undefined,
  random: (() => number) | undefined = undefined
): number {
  const current = now?.() ?? Math.floor(Date.now() / 1000);
  const entropy = clampRandom(random?.() ?? Math.random());
  return current - Math.floor(entropy * NIP59_RANDOM_TIMESTAMP_WINDOW_SECONDS);
}

function normalizeGiftWrapTags(
  recipientPubkey: string,
  tags: readonly (readonly string[])[]
): string[][] {
  const normalized = copyTags(tags).filter((tag) => tag.length > 0);
  const hasRecipient = normalized.some((tag) => tag[0] === 'p' && tag[1] === recipientPubkey);
  return hasRecipient ? normalized : [['p', recipientPubkey], ...normalized];
}

async function signNip59Seal(
  event: UnsignedEvent & { readonly kind: typeof NIP59_SEAL_KIND; readonly tags: [] },
  signer: EventSigner,
  pubkey: string
): Promise<Nip59SealEvent> {
  const signed = await signer.signEvent(event);
  const normalized = normalizeSignedEvent(event, signed, pubkey);
  if (!isNip59SealEvent(normalized)) {
    throw new Error('NIP-59 seals must be kind:13 events with empty tags');
  }
  return normalized as Nip59SealEvent;
}

function normalizeSignedEvent(
  event: UnsignedEvent,
  signed: SignedEventShape | { id: string; sig: string },
  pubkey: string
): SignedNostrEvent {
  if ('pubkey' in signed && signed.pubkey !== pubkey) {
    throw new Error('NIP-59 seal signer pubkey mismatch');
  }
  return {
    ...event,
    id: signed.id,
    pubkey: 'pubkey' in signed ? signed.pubkey : pubkey,
    sig: signed.sig
  };
}

function isUnsignedEventShape(
  event: Partial<Nip59Rumor>
): event is UnsignedNostrEvent & { pubkey: string } {
  return (
    typeof event.kind === 'number' &&
    typeof event.content === 'string' &&
    typeof event.created_at === 'number' &&
    typeof event.pubkey === 'string' &&
    Array.isArray(event.tags) &&
    event.tags.every((tag) => Array.isArray(tag) && tag.every((value) => typeof value === 'string'))
  );
}

function isSignedEventShape(event: Partial<SignedNostrEvent>): event is SignedNostrEvent {
  const maybeSigned = event as Partial<SignedNostrEvent> & { id?: unknown; sig?: unknown };
  return (
    isUnsignedEventShape(event) &&
    typeof maybeSigned.id === 'string' &&
    typeof maybeSigned.sig === 'string'
  );
}

function copyTags(tags: readonly (readonly string[])[]): string[][] {
  return tags.map((tag) => [...tag]);
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999_999, value));
}
