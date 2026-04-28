import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';

import type { Nip19Decoded, SignedNostrEvent, UnsignedNostrEvent } from './vocabulary.js';

type Nip19HexPrefix = 'npub' | 'nsec' | 'note';
type Nip19TlvPrefix = 'nprofile' | 'nevent' | 'naddr' | 'nrelay';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeHexEntity(prefix: Nip19HexPrefix, hex: string): string {
  return bech32.encode(prefix, bech32.toWords(hexToBytes(hex)), 5000);
}

function pushTlv(target: number[], type: number, payload: Uint8Array): void {
  if (payload.length > 0xff) {
    throw new Error(`TLV payload too large for NIP-19: ${payload.length}`);
  }
  target.push(type, payload.length, ...payload);
}

function encodeTlv(prefix: Nip19TlvPrefix, entries: Array<[number, Uint8Array]>): string {
  const bytes: number[] = [];
  for (const [type, payload] of [...entries].sort((left, right) => right[0] - left[0])) {
    pushTlv(bytes, type, payload);
  }
  return bech32.encode(prefix, bech32.toWords(Uint8Array.from(bytes)), 5000);
}

function decodeTlv(bytes: Uint8Array): Map<number, Uint8Array[]> | null {
  const entries = new Map<number, Uint8Array[]>();
  let index = 0;
  while (index < bytes.length) {
    if (index + 2 > bytes.length) return null;
    const type = bytes[index];
    const length = bytes[index + 1];
    const valueStart = index + 2;
    const valueEnd = valueStart + length;
    if (valueEnd > bytes.length) return null;
    const value = bytes.slice(valueStart, valueEnd);
    const list = entries.get(type) ?? [];
    list.push(value);
    entries.set(type, list);
    index = valueEnd;
  }
  return entries;
}

function encodeKind(kind: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, kind, false);
  return bytes;
}

function decodeKind(bytes: Uint8Array | undefined): number | undefined {
  if (!bytes || bytes.length !== 4) return undefined;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
}

function decodeRelayHints(entries: Map<number, Uint8Array[]>): string[] {
  return (entries.get(1) ?? []).map((entry) => textDecoder.decode(entry));
}

function decodeHexBytes(bytes: Uint8Array | undefined): string | null {
  if (!bytes || bytes.length !== 32) return null;
  return bytesToHex(bytes);
}

function serializeEvent(event: UnsignedNostrEvent & { pubkey: string }): string {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function getPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

export function getEventHash(event: UnsignedNostrEvent & { pubkey: string }): string {
  return bytesToHex(sha256(new TextEncoder().encode(serializeEvent(event))));
}

export function finalizeEvent(event: UnsignedNostrEvent, secretKey: Uint8Array): SignedNostrEvent {
  const pubkey = getPublicKey(secretKey);
  const id = getEventHash({ ...event, pubkey });
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

  const serializedId = getEventHash({
    pubkey: event.pubkey,
    kind: event.kind,
    created_at: event.created_at,
    tags: event.tags as string[][],
    content: event.content
  });

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

export function nsecEncode(secretKey: string): string {
  return encodeHexEntity('nsec', secretKey);
}

export function noteEncode(eventId: string): string {
  return encodeHexEntity('note', eventId);
}

export function nprofileEncode(input: { pubkey: string; relays?: string[] }): string {
  const entries: Array<[number, Uint8Array]> = [[0, hexToBytes(input.pubkey)]];
  for (const relay of input.relays ?? []) {
    entries.push([1, textEncoder.encode(relay)]);
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
    entries.push([1, textEncoder.encode(relay)]);
  }
  if (input.author) entries.push([2, hexToBytes(input.author)]);
  if (input.kind !== undefined) entries.push([3, encodeKind(input.kind)]);
  return encodeTlv('nevent', entries);
}

export function naddrEncode(input: {
  identifier: string;
  pubkey: string;
  kind: number;
  relays?: string[];
}): string {
  const entries: Array<[number, Uint8Array]> = [
    [0, textEncoder.encode(input.identifier)],
    [2, hexToBytes(input.pubkey)],
    [3, encodeKind(input.kind)]
  ];
  for (const relay of input.relays ?? []) {
    entries.push([1, textEncoder.encode(relay)]);
  }
  return encodeTlv('naddr', entries);
}

export function nrelayEncode(input: { relay: string }): string {
  return encodeTlv('nrelay', [[0, textEncoder.encode(input.relay)]]);
}

export function decodeNip19(value: string): Nip19Decoded | null {
  try {
    const decoded = bech32.decodeToBytes(value as `${string}1${string}`);
    switch (decoded.prefix) {
      case 'npub':
        if (decoded.bytes.length !== 32) return null;
        return { type: 'npub', pubkey: bytesToHex(decoded.bytes) };
      case 'nsec':
        if (decoded.bytes.length !== 32) return null;
        return { type: 'nsec', secretKey: bytesToHex(decoded.bytes) };
      case 'note':
        if (decoded.bytes.length !== 32) return null;
        return { type: 'note', eventId: bytesToHex(decoded.bytes) };
      case 'nprofile': {
        const tlv = decodeTlv(decoded.bytes);
        if (!tlv) return null;
        const pubkey = tlv.get(0)?.[0];
        const decodedPubkey = decodeHexBytes(pubkey);
        if (!decodedPubkey) return null;
        return {
          type: 'nprofile',
          pubkey: decodedPubkey,
          relays: decodeRelayHints(tlv)
        };
      }
      case 'nevent': {
        const tlv = decodeTlv(decoded.bytes);
        if (!tlv) return null;
        const eventId = tlv.get(0)?.[0];
        const decodedEventId = decodeHexBytes(eventId);
        if (!decodedEventId) return null;
        const author = tlv.get(2)?.[0];
        return {
          type: 'nevent',
          eventId: decodedEventId,
          relays: decodeRelayHints(tlv),
          author: decodeHexBytes(author) ?? undefined,
          kind: decodeKind(tlv.get(3)?.[0])
        };
      }
      case 'naddr': {
        const tlv = decodeTlv(decoded.bytes);
        if (!tlv) return null;
        const identifier = tlv.get(0)?.[0];
        const pubkey = decodeHexBytes(tlv.get(2)?.[0]);
        const kind = decodeKind(tlv.get(3)?.[0]);
        if (!identifier || !pubkey || kind === undefined) return null;
        return {
          type: 'naddr',
          identifier: textDecoder.decode(identifier),
          pubkey,
          kind,
          relays: decodeRelayHints(tlv)
        };
      }
      case 'nrelay': {
        const tlv = decodeTlv(decoded.bytes);
        if (!tlv) return null;
        const relay = tlv.get(0)?.[0] ?? tlv.get(1)?.[0];
        if (!relay) return null;
        return { type: 'nrelay', relay: textDecoder.decode(relay) };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
