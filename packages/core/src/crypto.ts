import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';

import type { Nip19Decoded, SignedNostrEvent, UnsignedNostrEvent } from './vocabulary.js';

function encodeHexEntity(prefix: 'npub' | 'note', hex: string): string {
  return bech32.encode(prefix, bech32.toWords(hexToBytes(hex)), 5000);
}

function pushTlv(target: number[], type: number, payload: Uint8Array): void {
  if (payload.length > 0xff) {
    throw new Error(`TLV payload too large for NIP-19: ${payload.length}`);
  }
  target.push(type, payload.length, ...payload);
}

function encodeTlv(prefix: 'nprofile' | 'nevent', entries: Array<[number, Uint8Array]>): string {
  const bytes: number[] = [];
  for (const [type, payload] of [...entries].sort((left, right) => right[0] - left[0])) {
    pushTlv(bytes, type, payload);
  }
  return bech32.encode(prefix, bech32.toWords(Uint8Array.from(bytes)), 5000);
}

function decodeTlv(bytes: Uint8Array): Map<number, Uint8Array[]> {
  const entries = new Map<number, Uint8Array[]>();
  let index = 0;
  while (index < bytes.length) {
    const type = bytes[index];
    const length = bytes[index + 1];
    const value = bytes.slice(index + 2, index + 2 + length);
    const list = entries.get(type) ?? [];
    list.push(value);
    entries.set(type, list);
    index += 2 + length;
  }
  return entries;
}

function serializeEvent(event: UnsignedNostrEvent & { pubkey: string }): string {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function getPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

export function finalizeEvent(event: UnsignedNostrEvent, secretKey: Uint8Array): SignedNostrEvent {
  const pubkey = getPublicKey(secretKey);
  const id = bytesToHex(sha256(new TextEncoder().encode(serializeEvent({ ...event, pubkey }))));
  const sig = bytesToHex(schnorr.sign(id, secretKey));
  return { ...event, id, pubkey, sig };
}

export async function verifier(event: Partial<SignedNostrEvent>): Promise<boolean> {
  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    typeof event.kind !== 'number' ||
    typeof event.created_at !== 'number' ||
    typeof event.content !== 'string' ||
    !Array.isArray(event.tags)
  ) {
    return false;
  }

  const serializedId = bytesToHex(
    sha256(
      new TextEncoder().encode(
        serializeEvent({
          pubkey: event.pubkey,
          kind: event.kind,
          created_at: event.created_at,
          tags: event.tags as string[][],
          content: event.content
        })
      )
    )
  );

  if (serializedId != event.id) return false;

  try {
    return schnorr.verify(event.sig, event.id, event.pubkey);
  } catch {
    return false;
  }
}

export function generateSecretKey(): Uint8Array {
  return secp256k1.utils.randomSecretKey();
}

export { bytesToHex, hexToBytes };

export function npubEncode(pubkey: string): string {
  return encodeHexEntity('npub', pubkey);
}

export function noteEncode(eventId: string): string {
  return encodeHexEntity('note', eventId);
}

export function nprofileEncode(input: { pubkey: string; relays?: string[] }): string {
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(input.pubkey)]];
  for (const relay of input.relays ?? []) {
    entries.push([1, new TextEncoder().encode(relay)]);
  }
  return encodeTlv('nprofile', entries);
}

export function neventEncode(input: {
  id: string;
  relays?: string[];
  author?: string;
  kind?: number;
}): string {
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(input.id)]];
  for (const relay of input.relays ?? []) {
    entries.push([1, new TextEncoder().encode(relay)]);
  }
  if (input.author) entries.push([2, hexToBytes(input.author)]);
  if (input.kind !== undefined) {
    const kind = new Uint8Array(4);
    new DataView(kind.buffer).setUint32(0, input.kind, false);
    entries.push([3, kind]);
  }
  return encodeTlv('nevent', entries);
}

export function decodeNip19(value: string): Nip19Decoded | null {
  try {
    const decoded = bech32.decodeToBytes(value as `${string}1${string}`);
    switch (decoded.prefix) {
      case 'npub':
        return { type: 'npub', pubkey: bytesToHex(decoded.bytes) };
      case 'note':
        return { type: 'note', eventId: bytesToHex(decoded.bytes) };
      case 'nprofile': {
        const tlv = decodeTlv(decoded.bytes);
        const pubkey = tlv.get(0)?.[0];
        if (!pubkey) return null;
        return {
          type: 'nprofile',
          pubkey: bytesToHex(pubkey),
          relays: (tlv.get(1) ?? []).map((entry) => new TextDecoder().decode(entry))
        };
      }
      case 'nevent': {
        const tlv = decodeTlv(decoded.bytes);
        const eventId = tlv.get(0)?.[0];
        if (!eventId) return null;
        const author = tlv.get(2)?.[0];
        const kindBytes = tlv.get(3)?.[0];
        return {
          type: 'nevent',
          eventId: bytesToHex(eventId),
          relays: (tlv.get(1) ?? []).map((entry) => new TextDecoder().decode(entry)),
          author: author ? bytesToHex(author) : undefined,
          kind:
            kindBytes && kindBytes.length === 4
              ? new DataView(
                  kindBytes.buffer,
                  kindBytes.byteOffset,
                  kindBytes.byteLength
                ).getUint32(0, false)
              : undefined
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
