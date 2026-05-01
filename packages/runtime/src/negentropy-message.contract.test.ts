import { describe, expect, it } from 'vitest';

import {
  decodeNegentropyIdListMessage,
  encodeNegentropyIdListMessage
} from './negentropy-message.js';

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);
const ID_C = 'c'.repeat(64);

function idListMessage(ids: readonly string[]): string {
  return `61000002${ids.length.toString(16).padStart(2, '0')}${ids.join('')}`;
}

describe('@auftakt/runtime negentropy message codec', () => {
  it('encodes an empty local set as the canonical empty ID-list message', () => {
    // NIP-77 helper frame used here:
    // 61 = protocol version byte
    // 00 = infinity upper-bound timestamp varint
    // 00 = zero-length ID prefix
    // 02 = ID-list mode
    // 00 = empty ID-list length
    expect(encodeNegentropyIdListMessage([])).toBe('6100000200');
  });

  it('decodes an empty ID-list message to an empty id array', () => {
    expect(decodeNegentropyIdListMessage('6100000200')).toEqual([]);
  });

  it('sorts event refs by created_at and then id before encoding', () => {
    const messageHex = encodeNegentropyIdListMessage([
      { id: ID_C, created_at: 2 },
      { id: ID_B, created_at: 1 },
      { id: ID_A, created_at: 1 }
    ]);

    expect(decodeNegentropyIdListMessage(messageHex)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('decodes ID-list messages and normalizes uppercase ids to lowercase hex', () => {
    expect(decodeNegentropyIdListMessage(idListMessage([ID_A.toUpperCase()]))).toEqual([ID_A]);
  });

  it('preserves duplicate IDs as lossless wire data', () => {
    expect(decodeNegentropyIdListMessage(idListMessage([ID_A, ID_A]))).toEqual([ID_A, ID_A]);
  });

  it('rejects odd-length hex payloads', () => {
    expect(() => decodeNegentropyIdListMessage('610')).toThrow(/even length/i);
  });

  it('rejects JSON-like non-hex payloads', () => {
    expect(() => decodeNegentropyIdListMessage('[]')).toThrow(/invalid byte/i);
  });

  it('rejects unsupported protocol versions', () => {
    expect(() => decodeNegentropyIdListMessage('6200000200')).toThrow(/unsupported.*version/i);
  });

  it('rejects event IDs with invalid length during encode', () => {
    expect(() => encodeNegentropyIdListMessage([{ id: 'a'.repeat(63), created_at: 1 }])).toThrow(
      /32-byte hex ids/i
    );
  });

  it('rejects event IDs with non-hex characters during encode', () => {
    expect(() => encodeNegentropyIdListMessage([{ id: 'g'.repeat(64), created_at: 1 }])).toThrow(
      /32-byte hex ids/i
    );
  });

  it('rejects unsupported range modes', () => {
    expect(() => decodeNegentropyIdListMessage('61000001')).toThrow(/unsupported.*mode/i);
  });

  it('rejects truncated ID-list payloads', () => {
    expect(() => decodeNegentropyIdListMessage('6100000201')).toThrow(/truncated/i);
  });

  it('rejects bytes that cannot be parsed as a complete trailing frame', () => {
    expect(() => decodeNegentropyIdListMessage('6100000200ff')).toThrow(/unterminated/i);
  });

  it('consumes skip-only ranges without generating synthetic IDs', () => {
    // 61 = protocol version, then one range:
    // 00 = infinity upper-bound timestamp varint
    // 00 = zero-length ID prefix
    // 00 = skip mode
    expect(decodeNegentropyIdListMessage('61000000')).toEqual([]);
  });

  it('consumes skip ranges before returning later ID-list IDs', () => {
    const messageHex = `6100000000000201${ID_B}`;
    // First range: 00 upper-bound, 00 prefix length, 00 skip mode.
    // Second range: 00 upper-bound, 00 prefix length, 02 ID-list mode, 01 ID-list length, ID_B.
    expect(decodeNegentropyIdListMessage(messageHex)).toEqual([ID_B]);
  });
});
