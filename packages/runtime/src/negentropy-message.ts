import type { NegentropyEventRef } from '@auftakt/core';

type NegentropyMessageEventRef = Pick<NegentropyEventRef, 'id' | 'created_at'>;

function sortNegentropyMessageRefsAsc<TEvent extends NegentropyMessageEventRef>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    if (left.created_at !== right.created_at) return left.created_at - right.created_at;
    return left.id.localeCompare(right.id);
  });
}

function encodeHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function decodeHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('negentropy hex payload must have even length');
  }
  if (!/^[0-9a-f]*$/i.test(hex)) {
    throw new Error('negentropy hex payload contains invalid byte');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function encodeVarint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('negentropy varint must be a non-negative integer');
  }

  const digits = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    digits.push(remaining & 0x7f);
    remaining >>>= 7;
  }

  return digits.reverse().map((digit, index) => (index < digits.length - 1 ? digit | 0x80 : digit));
}

function decodeVarint(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let index = start;

  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    index += 1;
    if ((byte & 0x80) === 0) {
      return { value, next: index };
    }
  }

  throw new Error('unterminated negentropy varint');
}

export function encodeNegentropyIdListMessage(
  events: readonly NegentropyMessageEventRef[]
): string {
  const sorted = sortNegentropyMessageRefsAsc(events);
  const bytes: number[] = [0x61, 0x00, 0x00, 0x02, ...encodeVarint(sorted.length)];

  for (const event of sorted) {
    if (!/^[0-9a-f]{64}$/i.test(event.id)) {
      throw new Error(`negentropy requires 32-byte hex ids, received: ${event.id}`);
    }
    bytes.push(...decodeHex(event.id));
  }

  return encodeHex(Uint8Array.from(bytes));
}

export function decodeNegentropyIdListMessage(messageHex: string): string[] {
  const bytes = decodeHex(messageHex);
  if ((bytes[0] ?? 0) !== 0x61) {
    throw new Error('unsupported negentropy protocol version');
  }

  let index = 1;
  const ids: string[] = [];

  while (index < bytes.length) {
    const upperTimestamp = decodeVarint(bytes, index);
    index = upperTimestamp.next;
    const prefixLength = decodeVarint(bytes, index);
    index = prefixLength.next + prefixLength.value;

    const mode = decodeVarint(bytes, index);
    index = mode.next;

    if (mode.value === 0) {
      continue;
    }

    if (mode.value !== 2) {
      throw new Error(`unsupported negentropy mode: ${mode.value}`);
    }

    const listLength = decodeVarint(bytes, index);
    index = listLength.next;

    for (let count = 0; count < listLength.value; count += 1) {
      const nextIndex = index + 32;
      if (nextIndex > bytes.length) {
        throw new Error('truncated negentropy id list');
      }
      ids.push(encodeHex(bytes.slice(index, nextIndex)));
      index = nextIndex;
    }
  }

  return ids;
}
