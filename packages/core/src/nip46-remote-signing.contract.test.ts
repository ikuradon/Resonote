import {
  buildNip46BunkerUrl,
  buildNip46ConnectRequest,
  buildNip46NostrConnectUrl,
  buildNip46RemoteSigningEvent,
  buildNip46SignEventRequest,
  isNip46AuthChallenge,
  NIP46_AUTH_CHALLENGE_RESULT,
  NIP46_REMOTE_SIGNING_KIND,
  parseNip46BunkerUrl,
  parseNip46NostrConnectUrl,
  parseNip46Permissions,
  parseNip46RemoteSigningEvent,
  parseNip46RequestPayloadJson,
  parseNip46ResponsePayloadJson,
  stringifyNip46Permissions,
  stringifyNip46RequestPayload,
  stringifyNip46ResponsePayload
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

const REMOTE_PUBKEY = 'a'.repeat(64);
const CLIENT_PUBKEY = 'b'.repeat(64);

describe('NIP-46 remote signing protocol helpers', () => {
  it('builds and parses bunker URLs with normalized relay hints', () => {
    const bunker = buildNip46BunkerUrl({
      remoteSignerPubkey: REMOTE_PUBKEY.toUpperCase(),
      relays: ['wss://relay.example/?ignored=1', 'https://invalid.example'],
      secret: ' connect-secret '
    });

    expect(bunker).toBe(
      `bunker://${REMOTE_PUBKEY}?relay=wss%3A%2F%2Frelay.example%2F&secret=connect-secret`
    );
    expect(parseNip46BunkerUrl(bunker)).toEqual({
      remoteSignerPubkey: REMOTE_PUBKEY,
      relays: ['wss://relay.example/'],
      secret: 'connect-secret'
    });
    expect(parseNip46BunkerUrl(`bunker://${REMOTE_PUBKEY}`)).toBeNull();
  });

  it('builds and parses nostrconnect URLs with permissions and metadata', () => {
    const url = buildNip46NostrConnectUrl({
      clientPubkey: CLIENT_PUBKEY,
      relays: ['wss://relay.example'],
      secret: 'secret',
      permissions: [{ method: 'sign_event', parameter: '1' }, { method: 'nip44_encrypt' }],
      name: 'Resonote',
      url: 'https://resonote.example',
      image: 'https://resonote.example/icon.png'
    });

    expect(parseNip46NostrConnectUrl(url)).toEqual({
      clientPubkey: CLIENT_PUBKEY,
      relays: ['wss://relay.example/'],
      secret: 'secret',
      permissions: [{ method: 'sign_event', parameter: '1' }, { method: 'nip44_encrypt' }],
      name: 'Resonote',
      url: 'https://resonote.example',
      image: 'https://resonote.example/icon.png'
    });
    expect(
      parseNip46NostrConnectUrl(`nostrconnect://${CLIENT_PUBKEY}?relay=wss://relay.example`)
    ).toBeNull();
  });

  it('round-trips permission strings', () => {
    const permissions = [{ method: 'sign_event', parameter: '1' }, { method: 'get_public_key' }];

    expect(stringifyNip46Permissions(permissions)).toBe('sign_event:1,get_public_key');
    expect(parseNip46Permissions(' sign_event:1, get_public_key, , nip44_decrypt:chat ')).toEqual([
      { method: 'sign_event', parameter: '1' },
      { method: 'get_public_key' },
      { method: 'nip44_decrypt', parameter: 'chat' }
    ]);
  });

  it('builds and parses JSON-RPC request and response payloads', () => {
    const connect = buildNip46ConnectRequest({
      id: 'req-1',
      remoteSignerPubkey: REMOTE_PUBKEY,
      secret: 'secret',
      permissions: [{ method: 'sign_event', parameter: '1' }]
    });
    const signEvent = buildNip46SignEventRequest({
      id: 'req-2',
      event: {
        kind: 1,
        content: 'hello',
        tags: [['t', 'nostr']],
        created_at: 1700000000
      }
    });

    expect(parseNip46RequestPayloadJson(stringifyNip46RequestPayload(connect))).toEqual({
      id: 'req-1',
      method: 'connect',
      params: [REMOTE_PUBKEY, 'secret', 'sign_event:1']
    });
    expect(parseNip46RequestPayloadJson(stringifyNip46RequestPayload(signEvent))).toEqual({
      id: 'req-2',
      method: 'sign_event',
      params: [
        JSON.stringify({
          kind: 1,
          content: 'hello',
          tags: [['t', 'nostr']],
          created_at: 1700000000
        })
      ]
    });

    const response = stringifyNip46ResponsePayload({
      id: 'req-2',
      result: 'signed-event-json'
    });
    expect(parseNip46ResponsePayloadJson(response)).toEqual({
      id: 'req-2',
      result: 'signed-event-json'
    });
  });

  it('detects auth challenge responses', () => {
    const challenge = parseNip46ResponsePayloadJson(
      stringifyNip46ResponsePayload({
        id: 'req-1',
        result: NIP46_AUTH_CHALLENGE_RESULT,
        error: 'https://signer.example/authorize'
      })
    );

    expect(challenge).toEqual({
      id: 'req-1',
      result: 'auth_url',
      error: 'https://signer.example/authorize'
    });
    expect(isNip46AuthChallenge(challenge!)).toBe(true);
  });

  it('builds and parses kind:24133 encrypted event envelopes', () => {
    const envelope = buildNip46RemoteSigningEvent({
      recipientPubkey: REMOTE_PUBKEY,
      encryptedContent: 'encrypted request',
      tags: [['alt', 'remote signing request']]
    });

    expect(envelope).toEqual({
      kind: NIP46_REMOTE_SIGNING_KIND,
      content: 'encrypted request',
      tags: [
        ['p', REMOTE_PUBKEY],
        ['alt', 'remote signing request']
      ]
    });
    expect(
      parseNip46RemoteSigningEvent({
        ...envelope,
        pubkey: CLIENT_PUBKEY,
        created_at: 1700000000
      })
    ).toEqual({
      senderPubkey: CLIENT_PUBKEY,
      recipientPubkeys: [REMOTE_PUBKEY],
      encryptedContent: 'encrypted request',
      createdAt: 1700000000,
      customTags: [['alt', 'remote signing request']]
    });
  });
});
