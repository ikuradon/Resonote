import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { Event as NostrEvent } from 'nostr-typedef';

export type RelayEventValidationFailureReason = 'malformed' | 'invalid-id' | 'invalid-signature';

export type RelayEventValidationResult =
  | { readonly ok: true; readonly event: NostrEvent }
  | { readonly ok: false; readonly reason: RelayEventValidationFailureReason };

function isHex(value: string, length: number): boolean {
  return value.length === length && /^[0-9a-f]+$/i.test(value);
}

function isStringTagArray(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === 'string'))
  );
}

function serializeEvent(
  event: Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>
): string {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

function computeEventId(
  event: Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>
): string {
  return bytesToHex(sha256(new TextEncoder().encode(serializeEvent(event))));
}

export async function validateRelayEvent(input: unknown): Promise<RelayEventValidationResult> {
  const event = input as Partial<NostrEvent>;
  if (
    typeof event !== 'object' ||
    event === null ||
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    typeof event.kind !== 'number' ||
    typeof event.created_at !== 'number' ||
    typeof event.content !== 'string' ||
    !isStringTagArray(event.tags)
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (!isHex(event.id, 64) || !isHex(event.pubkey, 64) || !isHex(event.sig, 128)) {
    return { ok: false, reason: 'malformed' };
  }

  if (
    computeEventId({
      pubkey: event.pubkey,
      created_at: event.created_at,
      kind: event.kind,
      tags: event.tags,
      content: event.content
    }) !== event.id
  ) {
    return { ok: false, reason: 'invalid-id' };
  }

  try {
    const validSignature = await schnorr.verify(event.sig, event.id, event.pubkey);
    if (!validSignature) return { ok: false, reason: 'invalid-signature' };
  } catch {
    return { ok: false, reason: 'invalid-signature' };
  }

  return { ok: true, event: event as NostrEvent };
}
