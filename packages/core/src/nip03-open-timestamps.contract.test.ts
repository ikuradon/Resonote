import { describe, expect, it } from 'vitest';

import {
  buildNip03OpenTimestampsAttestationEvent,
  buildNip03OpenTimestampsAttestationFilter,
  isNip03OtsFileBase64,
  NIP03_OPEN_TIMESTAMPS_KIND,
  parseNip03OpenTimestampsAttestationEvent,
  parseNip03TargetEventTag,
  parseNip03TargetKindTag
} from './index.js';

describe('NIP-03 OpenTimestamps attestations', () => {
  const targetEventId = 'a'.repeat(64);
  const author = 'b'.repeat(64);
  const otsFileBase64 = 'b3RzLXByb29m';

  it('builds kind:1040 attestation events with e/k tags and base64 OTS content', () => {
    expect(
      buildNip03OpenTimestampsAttestationEvent({
        targetEventId: targetEventId.toUpperCase(),
        targetKind: 1,
        relayUrl: 'wss://relay.example',
        otsFileBase64: ` ${otsFileBase64} `,
        tags: [
          ['e', 'ignored'],
          ['k', 'ignored'],
          ['client', 'resonote']
        ]
      })
    ).toEqual({
      kind: NIP03_OPEN_TIMESTAMPS_KIND,
      content: otsFileBase64,
      tags: [
        ['e', targetEventId, 'wss://relay.example'],
        ['k', '1'],
        ['client', 'resonote']
      ]
    });
  });

  it('parses attestation snapshots and low-level tags', () => {
    const event = buildNip03OpenTimestampsAttestationEvent({
      targetEventId,
      targetKind: 30023,
      relayUrl: 'wss://relay.example',
      otsFileBase64
    });

    expect(
      parseNip03OpenTimestampsAttestationEvent({
        ...event,
        pubkey: author,
        created_at: 123,
        id: 'attestation-id'
      })
    ).toEqual({
      kind: NIP03_OPEN_TIMESTAMPS_KIND,
      targetEventId,
      relayUrl: 'wss://relay.example',
      targetKind: 30023,
      otsFileBase64,
      customTags: [],
      pubkey: author,
      createdAt: 123,
      id: 'attestation-id'
    });
    expect(parseNip03TargetEventTag([['e', targetEventId, 'wss://relay.example']])).toEqual({
      eventId: targetEventId,
      relayUrl: 'wss://relay.example'
    });
    expect(parseNip03TargetEventTag([['e', targetEventId, 'https://relay.example']])).toBeNull();
    expect(parseNip03TargetKindTag([['k', '1040']])).toBe(1040);
  });

  it('builds relay filters for attestation lookup', () => {
    expect(
      buildNip03OpenTimestampsAttestationFilter({
        targetEventIds: [targetEventId],
        targetKinds: [1, 30023],
        authors: [author],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIP03_OPEN_TIMESTAMPS_KIND],
      '#e': [targetEventId],
      '#k': ['1', '30023'],
      authors: [author],
      since: 10,
      until: 20,
      limit: 5
    });
  });

  it('rejects malformed attestation data', () => {
    expect(isNip03OtsFileBase64(otsFileBase64)).toBe(true);
    expect(isNip03OtsFileBase64('not base64!')).toBe(false);
    expect(() =>
      buildNip03OpenTimestampsAttestationEvent({
        targetEventId: 'not-hex',
        targetKind: 1,
        relayUrl: 'wss://relay.example',
        otsFileBase64
      })
    ).toThrow(/target event id/);
    expect(() =>
      buildNip03OpenTimestampsAttestationEvent({
        targetEventId,
        targetKind: 1,
        relayUrl: 'https://relay.example',
        otsFileBase64
      })
    ).toThrow(/relay URL/);
    expect(
      parseNip03OpenTimestampsAttestationEvent({
        kind: NIP03_OPEN_TIMESTAMPS_KIND,
        content: 'not base64!',
        tags: [['e', targetEventId]]
      })
    ).toBeNull();
    expect(
      parseNip03OpenTimestampsAttestationEvent({ kind: 1, content: otsFileBase64, tags: [] })
    ).toBeNull();
  });
});
