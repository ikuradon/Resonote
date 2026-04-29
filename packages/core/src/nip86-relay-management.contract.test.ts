import { describe, expect, it } from 'vitest';

import type { EventSigner, UnsignedEvent } from './index.js';
import {
  buildNip86EventRequest,
  buildNip86KindRequest,
  buildNip86ManagementAuthEvent,
  buildNip86ManagementAuthorizationHeader,
  buildNip86ManagementHttpRequest,
  buildNip86PubkeyRequest,
  buildNip86RelayInfoRequest,
  buildNip86SupportedMethodsRequest,
  decodeNip98AuthorizationHeader,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  hashNip86ManagementRequest,
  hashNip98Payload,
  isNip86RelayManagementMethod,
  NIP86_CONTENT_TYPE,
  NIP86_HTTP_METHOD,
  NIP98_HTTP_AUTH_KIND,
  parseNip86BlockedIpList,
  parseNip86EventReasonList,
  parseNip86ManagementRequestJson,
  parseNip86ManagementResponseJson,
  parseNip86PubkeyReasonList,
  parseNip98HttpAuthEvent,
  verifier
} from './index.js';

function createSigner(): EventSigner {
  const secretKey = generateSecretKey();
  return {
    getPublicKey: () => getPublicKey(secretKey),
    signEvent: (event: UnsignedEvent) => finalizeEvent(event, secretKey)
  };
}

describe('NIP-86 relay management API', () => {
  const pubkey = 'a'.repeat(64);
  const eventId = 'b'.repeat(64);

  it('builds JSON-RPC-like management requests for standard methods', () => {
    expect(buildNip86SupportedMethodsRequest()).toEqual({
      method: 'supportedmethods',
      params: []
    });
    expect(buildNip86PubkeyRequest('banpubkey', pubkey.toUpperCase(), 'spam')).toEqual({
      method: 'banpubkey',
      params: [pubkey, 'spam']
    });
    expect(buildNip86EventRequest('allowevent', eventId)).toEqual({
      method: 'allowevent',
      params: [eventId]
    });
    expect(buildNip86RelayInfoRequest('changerelayicon', 'https://relay.example/icon.png')).toEqual(
      {
        method: 'changerelayicon',
        params: ['https://relay.example/icon.png']
      }
    );
    expect(buildNip86KindRequest('allowkind', 30023)).toEqual({
      method: 'allowkind',
      params: [30023]
    });
  });

  it('builds HTTP descriptors with the NIP-86 content type', () => {
    const request = buildNip86PubkeyRequest('allowpubkey', pubkey);
    expect(buildNip86ManagementHttpRequest({ relayUrl: 'https://relay.example', request })).toEqual(
      {
        url: 'https://relay.example',
        method: NIP86_HTTP_METHOD,
        headers: { 'content-type': NIP86_CONTENT_TYPE },
        body: JSON.stringify({ method: 'allowpubkey', params: [pubkey] }),
        request
      }
    );
    expect(
      buildNip86ManagementHttpRequest({
        relayUrl: 'https://relay.example',
        request,
        authorizationHeader: 'Nostr token'
      }).headers
    ).toEqual({
      'content-type': NIP86_CONTENT_TYPE,
      authorization: 'Nostr token'
    });
  });

  it('builds NIP-98 auth events with required payload hashes', async () => {
    const request = buildNip86PubkeyRequest('unbanpubkey', pubkey, 'appeal accepted');
    const payload = JSON.stringify({
      method: 'unbanpubkey',
      params: [pubkey, 'appeal accepted']
    });
    const auth = buildNip86ManagementAuthEvent({
      relayUrl: 'https://relay.example',
      request,
      createdAt: 100
    });

    expect(hashNip86ManagementRequest(request)).toBe(hashNip98Payload(payload));
    expect(auth).toEqual({
      kind: NIP98_HTTP_AUTH_KIND,
      created_at: 100,
      content: '',
      tags: [
        ['u', 'https://relay.example'],
        ['method', 'POST'],
        ['payload', hashNip98Payload(payload)]
      ]
    });

    const header = await buildNip86ManagementAuthorizationHeader({
      signer: createSigner(),
      relayUrl: 'https://relay.example',
      request,
      createdAt: 100
    });
    const decoded = decodeNip98AuthorizationHeader(header);
    expect(decoded).not.toBeNull();
    const signed = parseNip98HttpAuthEvent(decoded!);
    expect(signed?.payloadHash).toBe(hashNip98Payload(payload));
    expect(await verifier(decoded!)).toBe(true);
  });

  it('parses management requests, responses, and reason lists', () => {
    expect(
      parseNip86ManagementRequestJson(JSON.stringify({ method: 'listallowedkinds', params: [] }))
    ).toEqual({ method: 'listallowedkinds', params: [] });
    expect(
      parseNip86ManagementRequestJson(JSON.stringify({ method: 'unknown', params: [] }))
    ).toBeNull();

    expect(parseNip86ManagementResponseJson(JSON.stringify({ result: true }))).toEqual({
      result: true,
      error: null
    });
    expect(
      parseNip86ManagementResponseJson(JSON.stringify({ result: null, error: 'denied' }))
    ).toEqual({
      result: null,
      error: 'denied'
    });
    expect(parseNip86PubkeyReasonList([{ pubkey, reason: 'spam' }])).toEqual([
      { pubkey, reason: 'spam' }
    ]);
    expect(parseNip86EventReasonList([{ id: eventId }])).toEqual([{ id: eventId, reason: null }]);
    expect(parseNip86BlockedIpList([{ ip: '203.0.113.10', reason: 'abuse' }])).toEqual([
      { ip: '203.0.113.10', reason: 'abuse' }
    ]);
  });

  it('rejects invalid management method inputs', () => {
    expect(isNip86RelayManagementMethod('supportedmethods')).toBe(true);
    expect(isNip86RelayManagementMethod('unknown')).toBe(false);
    expect(() => buildNip86PubkeyRequest('banpubkey', 'not-hex')).toThrow(/pubkey/);
    expect(() => buildNip86EventRequest('banevent', 'not-hex')).toThrow(/event id/);
    expect(() => buildNip86KindRequest('disallowkind', -1)).toThrow(/kind/);
    expect(() => buildNip86RelayInfoRequest('changerelayicon', '/relative.png')).toThrow(
      /absolute URL/
    );
  });
});
