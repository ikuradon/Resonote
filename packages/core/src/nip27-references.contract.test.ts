import { describe, expect, it } from 'vitest';

import {
  buildNip27ReferenceTags,
  extractNip27References,
  naddrEncode,
  neventEncode,
  noteEncode,
  nprofileEncode,
  npubEncode,
  nrelayEncode,
  nsecEncode
} from './index.js';

const pubkey = '0'.repeat(64);
const eventId = '1'.repeat(64);
const relay = 'wss://relay.example/';

describe('NIP-27 text note references', () => {
  it('extracts NIP-21 profile and event references with source positions', () => {
    const npub = npubEncode(pubkey);
    const nevent = neventEncode({ id: eventId, relays: [relay], author: pubkey });
    const content = `hello nostr:${npub} quoted nostr:${nevent}`;

    expect(extractNip27References(content)).toMatchObject([
      {
        uri: `nostr:${npub}`,
        identifier: npub,
        decoded: { type: 'npub', pubkey },
        index: 6,
        length: `nostr:${npub}`.length
      },
      {
        uri: `nostr:${nevent}`,
        identifier: nevent,
        decoded: { type: 'nevent', eventId, relays: [relay], author: pubkey }
      }
    ]);
  });

  it('ignores invalid nostr URIs, nsec payloads, and relay-only references for tag building', () => {
    const nsec = nsecEncode('2'.repeat(64));
    const nrelay = nrelayEncode({ relay });
    const note = noteEncode(eventId);
    const content = `bad nostr:not-a-code secret nostr:${nsec} relay nostr:${nrelay} note nostr:${note}`;

    expect(extractNip27References(content).map((reference) => reference.decoded.type)).toEqual([
      'nrelay',
      'note'
    ]);
    expect(buildNip27ReferenceTags(content)).toEqual([['q', eventId]]);
  });

  it('builds optional mention tags for profiles, events, and addressable references', () => {
    const nprofile = nprofileEncode({ pubkey, relays: [relay] });
    const nevent = neventEncode({ id: eventId, relays: [relay] });
    const naddr = naddrEncode({ kind: 30023, pubkey, identifier: 'article', relays: [relay] });

    expect(buildNip27ReferenceTags(`nostr:${nprofile} nostr:${nevent} nostr:${naddr}`)).toEqual([
      ['p', pubkey, relay],
      ['q', eventId, relay],
      ['a', `30023:${pubkey}:article`, relay]
    ]);
  });

  it('deduplicates tags by tag name and referenced entity', () => {
    const npub = npubEncode(pubkey);
    const nprofile = nprofileEncode({ pubkey, relays: [relay] });

    expect(buildNip27ReferenceTags(`nostr:${npub} nostr:${nprofile}`)).toEqual([['p', pubkey]]);
  });
});
