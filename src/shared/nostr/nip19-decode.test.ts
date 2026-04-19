import {
  decodeNip19 as coreDecodeNip19,
  neventEncode as coreNeventEncode,
  noteEncode as coreNoteEncode,
  nprofileEncode as coreNprofileEncode,
  npubEncode as coreNpubEncode
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import { decodeNip19 } from './nip19-decode.js';

const TEST_PUBKEY_HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const TEST_EVENT_ID_HEX = 'b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87';
const TEST_RELAY = 'wss://relay.example.com';

const CANONICAL_NPUB = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';
const CANONICAL_NOTE = 'note1k03e9vglt48jsvsuahgfxqa8fzk06py846j6w3gtxjquvzmwf7rsrw5ajp';
const CANONICAL_NPROFILE =
  'nprofile1qythwumn8ghj7un9d3shjtn90psk6urvv5hxxmmdqqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gj7sqkj';
const CANONICAL_NEVENT =
  'nevent1qvzqqqqy2upzqwlsccluhy6xxsr6l9a9uhhxf75g85g8a709tprjcn4e42h053vaqythwumn8ghj7un9d3shjtn90psk6urvv5hxxmmdqqst8cujky046negxgwwm5ynqwn53t8aqjr6afd8g59nfqwxpdhylpcwygh38';

describe('decodeNip19', () => {
  it('valid npub → decoded with pubkey', () => {
    const npub = coreNpubEncode(TEST_PUBKEY_HEX);
    const result = decodeNip19(npub);
    expect(result).toEqual({ type: 'npub', pubkey: TEST_PUBKEY_HEX });
  });

  it('valid nprofile with relays → decoded with pubkey + relays', () => {
    const nprofile = coreNprofileEncode({ pubkey: TEST_PUBKEY_HEX, relays: [TEST_RELAY] });
    const result = decodeNip19(nprofile);
    expect(result).toEqual({
      type: 'nprofile',
      pubkey: TEST_PUBKEY_HEX,
      relays: [TEST_RELAY]
    });
  });

  it('valid nevent → decoded with eventId + relays', () => {
    const nevent = coreNeventEncode({ id: TEST_EVENT_ID_HEX, relays: [TEST_RELAY] });
    const result = decodeNip19(nevent);
    expect(result).toEqual({
      type: 'nevent',
      eventId: TEST_EVENT_ID_HEX,
      relays: [TEST_RELAY],
      author: undefined,
      kind: undefined
    });
  });

  it('valid note → decoded with eventId', () => {
    const note = coreNoteEncode(TEST_EVENT_ID_HEX);
    const result = decodeNip19(note);
    expect(result).toEqual({ type: 'note', eventId: TEST_EVENT_ID_HEX });
  });

  it('core encoders are byte-compatible with canonical NIP-19 outputs', () => {
    expect(coreNpubEncode(TEST_PUBKEY_HEX)).toBe(CANONICAL_NPUB);
    expect(coreNoteEncode(TEST_EVENT_ID_HEX)).toBe(CANONICAL_NOTE);
    expect(coreNprofileEncode({ pubkey: TEST_PUBKEY_HEX, relays: [TEST_RELAY] })).toBe(
      CANONICAL_NPROFILE
    );
    expect(
      coreNeventEncode({
        id: TEST_EVENT_ID_HEX,
        relays: [TEST_RELAY],
        author: TEST_PUBKEY_HEX,
        kind: 1111
      })
    ).toBe(CANONICAL_NEVENT);
  });

  it('core decoder accepts canonical upstream encodings', () => {
    expect(coreDecodeNip19(CANONICAL_NPUB)).toEqual({
      type: 'npub',
      pubkey: TEST_PUBKEY_HEX
    });
    expect(coreDecodeNip19(CANONICAL_NOTE)).toEqual({
      type: 'note',
      eventId: TEST_EVENT_ID_HEX
    });
    expect(coreDecodeNip19(CANONICAL_NPROFILE)).toEqual({
      type: 'nprofile',
      pubkey: TEST_PUBKEY_HEX,
      relays: [TEST_RELAY]
    });
    expect(coreDecodeNip19(CANONICAL_NEVENT)).toEqual({
      type: 'nevent',
      eventId: TEST_EVENT_ID_HEX,
      relays: [TEST_RELAY],
      author: TEST_PUBKEY_HEX,
      kind: 1111
    });
  });

  it('invalid string → null', () => {
    const result = decodeNip19('notanip19string');
    expect(result).toBeNull();
  });

  it('empty string → null', () => {
    const result = decodeNip19('');
    expect(result).toBeNull();
  });
});
