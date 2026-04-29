import {
  buildNip55ContentResolverSelectionArgs,
  buildNip55ContentResolverUri,
  buildNip55IntentRequest,
  buildNip55SignerUrl,
  isNip55SignerMethod,
  NIP55_NOSTRSIGNER_SCHEME,
  parseNip55Permissions,
  parseNip55SignerResultParams,
  parseNip55SignerResultUrl,
  parseNip55SignerUrl,
  stringifyNip55Permissions
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

const PUBKEY = 'a'.repeat(64);

describe('NIP-55 Android signer helpers', () => {
  it('builds and parses nostrsigner web URLs', () => {
    const eventJson = JSON.stringify({ kind: 1, content: 'hello' });
    const url = buildNip55SignerUrl({
      type: 'sign_event',
      content: eventJson,
      callbackUrl: 'https://resonote.example/callback?event=',
      returnType: 'event',
      compressionType: 'gzip',
      currentUser: PUBKEY,
      id: 'event-id'
    });

    expect(url).toBe(
      `${NIP55_NOSTRSIGNER_SCHEME}${encodeURIComponent(
        eventJson
      )}?type=sign_event&compressionType=gzip&returnType=event&callbackUrl=https%3A%2F%2Fresonote.example%2Fcallback%3Fevent%3D&current_user=${PUBKEY}&id=event-id`
    );
    expect(parseNip55SignerUrl(url)).toEqual({
      type: 'sign_event',
      content: eventJson,
      pubkey: null,
      callbackUrl: 'https://resonote.example/callback?event=',
      returnType: 'event',
      compressionType: 'gzip',
      currentUser: PUBKEY,
      id: 'event-id',
      permissions: []
    });
  });

  it('builds get_public_key URLs with permission JSON', () => {
    const permissions = [
      { type: 'sign_event' as const, kind: 22242 },
      { type: 'nip44_decrypt' as const }
    ];
    const url = buildNip55SignerUrl({
      type: 'get_public_key',
      permissions
    });

    expect(parseNip55SignerUrl(url)).toMatchObject({
      type: 'get_public_key',
      content: '',
      permissions
    });
  });

  it('builds Android intent request descriptors', () => {
    expect(
      buildNip55IntentRequest({
        type: 'nip44_encrypt',
        content: 'plaintext',
        pubkey: 'recipient',
        currentUser: PUBKEY,
        id: 'encrypt-1',
        packageName: 'com.example.signer'
      })
    ).toEqual({
      uri: 'nostrsigner:plaintext',
      packageName: 'com.example.signer',
      extras: {
        type: 'nip44_encrypt',
        pubkey: 'recipient',
        current_user: PUBKEY,
        id: 'encrypt-1'
      }
    });
  });

  it('builds content resolver URIs and selection args', () => {
    expect(buildNip55ContentResolverUri('com.example.signer', 'sign_event')).toBe(
      'content://com.example.signer.SIGN_EVENT'
    );
    expect(
      buildNip55ContentResolverSelectionArgs({
        type: 'nip04_encrypt',
        content: 'plain',
        pubkey: 'recipient',
        currentUser: PUBKEY
      })
    ).toEqual(['plain', 'recipient', PUBKEY]);
    expect(
      buildNip55ContentResolverSelectionArgs({
        type: 'sign_event',
        content: '{"kind":1}',
        pubkey: 'ignored',
        currentUser: PUBKEY
      })
    ).toEqual(['{"kind":1}', '', PUBKEY]);
  });

  it('round-trips permission JSON and filters malformed entries', () => {
    const permissions = [
      { type: 'sign_event' as const, kind: 1 },
      { type: 'nip44_encrypt' as const }
    ];

    expect(parseNip55Permissions(stringifyNip55Permissions(permissions))).toEqual(permissions);
    expect(
      parseNip55Permissions(
        JSON.stringify([
          { type: 'sign_event', kind: 1 },
          { type: 'unknown' },
          { type: 'nip44_decrypt', kind: -1 }
        ])
      )
    ).toEqual([{ type: 'sign_event', kind: 1 }]);
    expect(isNip55SignerMethod('decrypt_zap_event')).toBe(true);
  });

  it('parses callback and multi-result payloads', () => {
    const results = [{ package: 'com.example.signer', result: 'sig', id: 'event-1' }];
    const callbackUrl = `https://resonote.example/callback?result=sig&id=event-1&package=com.example.signer&results=${encodeURIComponent(
      JSON.stringify(results)
    )}`;

    expect(parseNip55SignerResultUrl(callbackUrl)).toEqual({
      result: 'sig',
      event: null,
      id: 'event-1',
      packageName: 'com.example.signer',
      results,
      rejected: false
    });
    expect(parseNip55SignerResultParams({ rejected: '', result: null })).toMatchObject({
      rejected: true,
      result: null
    });
  });
});
