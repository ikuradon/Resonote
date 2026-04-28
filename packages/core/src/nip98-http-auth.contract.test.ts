import { describe, expect, it } from 'vitest';

import type { EventSigner, UnsignedEvent } from './index.js';
import {
  buildNip98AuthorizationHeader,
  buildNip98HttpAuthEvent,
  decodeNip98AuthorizationHeader,
  encodeNip98AuthorizationHeader,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  hashNip98Payload,
  isNip98PayloadHash,
  NIP98_AUTHORIZATION_SCHEME,
  NIP98_HTTP_AUTH_KIND,
  parseNip98HttpAuthEvent,
  signNip98HttpAuthEvent,
  validateNip98HttpAuthEvent,
  verifier
} from './index.js';

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

function createSigner(): EventSigner {
  const secretKey = generateSecretKey();
  return {
    getPublicKey: () => getPublicKey(secretKey),
    signEvent: (event: UnsignedEvent) => finalizeEvent(event, secretKey)
  };
}

describe('NIP-98 HTTP auth events', () => {
  it('builds kind:27235 auth events with canonical u, method, and payload tags', () => {
    expect(hashNip98Payload('hello')).toBe(HELLO_SHA256);
    expect(isNip98PayloadHash(HELLO_SHA256)).toBe(true);

    expect(
      buildNip98HttpAuthEvent({
        url: ' https://api.example.test/items?limit=1 ',
        method: 'post',
        createdAt: 100,
        payload: 'hello',
        tags: [
          ['method', 'GET'],
          ['client', 'Resonote']
        ]
      })
    ).toEqual({
      kind: NIP98_HTTP_AUTH_KIND,
      created_at: 100,
      content: '',
      tags: [
        ['u', 'https://api.example.test/items?limit=1'],
        ['method', 'POST'],
        ['payload', HELLO_SHA256],
        ['client', 'Resonote']
      ]
    });
  });

  it('signs and encodes Authorization headers using the Nostr scheme', async () => {
    const signer = createSigner();
    const signed = await signNip98HttpAuthEvent({
      signer,
      url: 'https://api.example.test/items',
      method: 'GET',
      createdAt: 100
    });

    expect(await verifier(signed)).toBe(true);

    const header = encodeNip98AuthorizationHeader(signed);
    expect(header.startsWith(`${NIP98_AUTHORIZATION_SCHEME} `)).toBe(true);
    expect(decodeNip98AuthorizationHeader(header)).toEqual(signed);

    await expect(
      buildNip98AuthorizationHeader({
        signer,
        url: 'https://api.example.test/items',
        method: 'GET',
        createdAt: 100
      })
    ).resolves.toMatch(/^Nostr /);
  });

  it('parses and validates HTTP auth events against request metadata', async () => {
    const signed = await signNip98HttpAuthEvent({
      signer: createSigner(),
      url: 'https://api.example.test/items?limit=1',
      method: 'POST',
      createdAt: 100,
      payload: 'hello'
    });

    expect(parseNip98HttpAuthEvent(signed)).toEqual({
      url: 'https://api.example.test/items?limit=1',
      method: 'POST',
      payloadHash: HELLO_SHA256,
      content: '',
      pubkey: signed.pubkey,
      createdAt: 100
    });

    expect(
      validateNip98HttpAuthEvent(signed, {
        url: 'https://api.example.test/items?limit=1',
        method: 'post',
        now: 120,
        payload: 'hello'
      })
    ).toEqual({
      ok: true,
      snapshot: {
        url: 'https://api.example.test/items?limit=1',
        method: 'POST',
        payloadHash: HELLO_SHA256,
        content: '',
        pubkey: signed.pubkey,
        createdAt: 100
      }
    });
  });

  it('rejects malformed auth events and request mismatches', async () => {
    const signed = await signNip98HttpAuthEvent({
      signer: createSigner(),
      url: 'https://api.example.test/items',
      method: 'PATCH',
      createdAt: 100,
      payload: 'hello'
    });

    expect(() =>
      buildNip98HttpAuthEvent({
        url: '/relative',
        method: 'GET'
      })
    ).toThrow('NIP-98 u tag must be an absolute URL');
    expect(() =>
      buildNip98HttpAuthEvent({
        url: 'https://api.example.test/items',
        method: 'POST',
        payload: 'hello',
        payloadHash: '0'.repeat(64)
      })
    ).toThrow('NIP-98 payload hash does not match payload');
    expect(
      parseNip98HttpAuthEvent({
        ...signed,
        tags: [
          ['u', 'relative'],
          ['method', 'GET']
        ]
      })
    ).toBeNull();
    expect(decodeNip98AuthorizationHeader('Bearer token')).toBeNull();

    expect(
      validateNip98HttpAuthEvent(signed, {
        url: 'https://api.example.test/items',
        method: 'PATCH',
        now: 200
      })
    ).toEqual({ ok: false, reason: 'expired' });
    expect(
      validateNip98HttpAuthEvent(signed, {
        url: 'https://api.example.test/other',
        method: 'PATCH',
        now: 100
      })
    ).toEqual({ ok: false, reason: 'url-mismatch' });
    expect(
      validateNip98HttpAuthEvent(signed, {
        url: 'https://api.example.test/items',
        method: 'GET',
        now: 100
      })
    ).toEqual({ ok: false, reason: 'method-mismatch' });
    expect(
      validateNip98HttpAuthEvent(signed, {
        url: 'https://api.example.test/items',
        method: 'PATCH',
        now: 100,
        payload: 'different'
      })
    ).toEqual({ ok: false, reason: 'payload-mismatch' });
  });
});
