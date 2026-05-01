import { describe, expect, it } from 'vitest';

import {
  getPublicKey,
  isNip21Uri,
  NIP21_URI_SCHEME,
  noteEncode,
  npubEncode,
  nrelayEncode,
  nsecEncode,
  parseNip21Uri,
  toNip21Uri
} from './index.js';

const pubkey = getPublicKey(new Uint8Array(32).fill(21));
const eventId = 'f'.repeat(64);

describe('NIP-21 URI scheme', () => {
  it('parses nostr: URIs whose payload is a public NIP-19 identifier', () => {
    const npub = npubEncode(pubkey);

    expect(parseNip21Uri(`${NIP21_URI_SCHEME}${npub}`)).toEqual({
      scheme: 'nostr',
      identifier: npub,
      decoded: {
        type: 'npub',
        pubkey
      }
    });
  });

  it('treats URI schemes case-insensitively while preserving the identifier', () => {
    const note = noteEncode(eventId);

    expect(parseNip21Uri(`NOSTR:${note}`)).toMatchObject({
      scheme: 'nostr',
      identifier: note,
      decoded: {
        type: 'note',
        eventId
      }
    });
  });

  it('accepts non-secret NIP-19 TLV identifiers including nrelay', () => {
    const nrelay = nrelayEncode({ relay: 'wss://relay.example/' });

    expect(parseNip21Uri(`nostr:${nrelay}`)).toMatchObject({
      identifier: nrelay,
      decoded: {
        type: 'nrelay',
        relay: 'wss://relay.example/'
      }
    });
  });

  it('rejects nsec, missing schemes, invalid payloads, and whitespace in the payload', () => {
    const nsec = nsecEncode('1'.repeat(64));

    expect(parseNip21Uri(`nostr:${nsec}`)).toBeNull();
    expect(parseNip21Uri(npubEncode(pubkey))).toBeNull();
    expect(parseNip21Uri('nostr:not-a-nip19')).toBeNull();
    expect(parseNip21Uri(`nostr:${npubEncode(pubkey)} trailing`)).toBeNull();
    expect(isNip21Uri(`nostr:${nsec}`)).toBe(false);
  });

  it('builds normalized nostr: URIs from safe identifiers or existing URIs', () => {
    const note = noteEncode(eventId);
    const nsec = nsecEncode('1'.repeat(64));

    expect(toNip21Uri(note)).toBe(`nostr:${note}`);
    expect(toNip21Uri(`NOSTR:${note}`)).toBe(`nostr:${note}`);
    expect(toNip21Uri(nsec)).toBeNull();
    expect(toNip21Uri(`nostr:${nsec}`)).toBeNull();
  });
});
