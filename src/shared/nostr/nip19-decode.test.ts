import { neventEncode, noteEncode, nprofileEncode, npubEncode } from 'nostr-tools/nip19';
import { describe, expect, it } from 'vitest';

import { decodeNip19 } from './nip19-decode.js';

const TEST_PUBKEY_HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const TEST_EVENT_ID_HEX = 'b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87';
const TEST_RELAY = 'wss://relay.example.com';

describe('decodeNip19', () => {
  it('valid npub → decoded with pubkey', () => {
    const npub = npubEncode(TEST_PUBKEY_HEX);
    const result = decodeNip19(npub);
    expect(result).toEqual({ type: 'npub', pubkey: TEST_PUBKEY_HEX });
  });

  it('valid nprofile with relays → decoded with pubkey + relays', () => {
    const nprofile = nprofileEncode({ pubkey: TEST_PUBKEY_HEX, relays: [TEST_RELAY] });
    const result = decodeNip19(nprofile);
    expect(result).toEqual({
      type: 'nprofile',
      pubkey: TEST_PUBKEY_HEX,
      relays: [TEST_RELAY]
    });
  });

  it('valid nevent → decoded with eventId + relays', () => {
    const nevent = neventEncode({ id: TEST_EVENT_ID_HEX, relays: [TEST_RELAY] });
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
    const note = noteEncode(TEST_EVENT_ID_HEX);
    const result = decodeNip19(note);
    expect(result).toEqual({ type: 'note', eventId: TEST_EVENT_ID_HEX });
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
