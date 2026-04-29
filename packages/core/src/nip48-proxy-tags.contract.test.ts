import { describe, expect, it } from 'vitest';

import {
  appendNip48ProxyTags,
  buildNip48ProxyTag,
  hasNip48ProxyTag,
  isNip48KnownProxyProtocol,
  isNip48ProxyTag,
  isValidNip48KnownProxyId,
  NIP48_PROXY_TAG,
  NIP48_SUPPORTED_PROTOCOLS,
  normalizeNip48ProxyProtocol,
  parseNip48ProxyTag,
  parseNip48ProxyTags,
  resolveNip48ProxySourceUrl
} from './index.js';

describe('NIP-48 proxy tags', () => {
  it('builds proxy tags for bridged source objects', () => {
    expect(
      buildNip48ProxyTag({
        id: ' https://gleasonator.com/objects/9f524868-c1a0-4ee7-ad51-aaa23d68b526 ',
        protocol: ' ActivityPub ',
        extra: [' future ']
      })
    ).toEqual([
      'proxy',
      'https://gleasonator.com/objects/9f524868-c1a0-4ee7-ad51-aaa23d68b526',
      'activitypub',
      'future'
    ]);
  });

  it('appends proxy tags without changing existing event kind-specific tags', () => {
    expect(
      appendNip48ProxyTags(
        [
          ['e', 'event-id'],
          ['p', 'pubkey']
        ],
        [
          {
            id: 'https://twitter.com/jack/status/20',
            protocol: 'web'
          }
        ]
      )
    ).toEqual([
      ['e', 'event-id'],
      ['p', 'pubkey'],
      ['proxy', 'https://twitter.com/jack/status/20', 'web']
    ]);
  });

  it('parses supported protocols, validity, source URLs, and future extra parameters', () => {
    expect(
      parseNip48ProxyTags({
        tags: [
          [
            'proxy',
            'https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79',
            'activitypub'
          ],
          [
            'proxy',
            'at://did:plc:zhbjlbmir5dganqhueg7y4i3/app.bsky.feed.post/3jt5hlibeol2i',
            'atproto'
          ],
          [
            'proxy',
            'https://soapbox.pub/rss/feed.xml#https%3A%2F%2Fsoapbox.pub%2Fblog%2Fmostr-fediverse-nostr-bridge',
            'rss',
            'future'
          ],
          ['proxy', 'https://twitter.com/jack/status/20', 'web'],
          ['client', 'resonote']
        ]
      })
    ).toEqual([
      {
        id: 'https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79',
        protocol: 'activitypub',
        knownProtocol: true,
        validKnownProtocolId: true,
        sourceUrl: 'https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79',
        extra: []
      },
      {
        id: 'at://did:plc:zhbjlbmir5dganqhueg7y4i3/app.bsky.feed.post/3jt5hlibeol2i',
        protocol: 'atproto',
        knownProtocol: true,
        validKnownProtocolId: true,
        sourceUrl: null,
        extra: []
      },
      {
        id: 'https://soapbox.pub/rss/feed.xml#https%3A%2F%2Fsoapbox.pub%2Fblog%2Fmostr-fediverse-nostr-bridge',
        protocol: 'rss',
        knownProtocol: true,
        validKnownProtocolId: true,
        sourceUrl:
          'https://soapbox.pub/rss/feed.xml#https%3A%2F%2Fsoapbox.pub%2Fblog%2Fmostr-fediverse-nostr-bridge',
        extra: ['future']
      },
      {
        id: 'https://twitter.com/jack/status/20',
        protocol: 'web',
        knownProtocol: true,
        validKnownProtocolId: true,
        sourceUrl: 'https://twitter.com/jack/status/20',
        extra: []
      }
    ]);
  });

  it('accepts custom protocols while marking known invalid IDs', () => {
    expect(buildNip48ProxyTag({ id: 'opaque-source-id', protocol: 'custom' })).toEqual([
      'proxy',
      'opaque-source-id',
      'custom'
    ]);
    expect(parseNip48ProxyTag(['proxy', 'not a url', 'web'])).toEqual({
      id: 'not a url',
      protocol: 'web',
      knownProtocol: true,
      validKnownProtocolId: false,
      sourceUrl: null,
      extra: []
    });
  });

  it('exposes constants, guards, and protocol normalization helpers', () => {
    expect(NIP48_PROXY_TAG).toBe('proxy');
    expect(NIP48_SUPPORTED_PROTOCOLS).toEqual(['activitypub', 'atproto', 'rss', 'web']);
    expect(isNip48ProxyTag(['proxy', 'id', 'web'])).toBe(true);
    expect(isNip48ProxyTag(['e', 'id'])).toBe(false);
    expect(isNip48KnownProxyProtocol('activitypub')).toBe(true);
    expect(isNip48KnownProxyProtocol('custom')).toBe(false);
    expect(normalizeNip48ProxyProtocol('AtProto')).toBe('atproto');
    expect(hasNip48ProxyTag([['proxy', 'https://example.com/source', 'web']])).toBe(true);
    expect(hasNip48ProxyTag([['e', 'event-id']])).toBe(false);
  });

  it('validates known protocol source ID formats', () => {
    expect(isValidNip48KnownProxyId('activitypub', 'https://example.com/object')).toBe(true);
    expect(isValidNip48KnownProxyId('web', 'https://twitter.com/jack/status/20')).toBe(true);
    expect(isValidNip48KnownProxyId('rss', 'https://example.com/feed.xml#guid')).toBe(true);
    expect(isValidNip48KnownProxyId('atproto', 'at://did:plc:abc/app.bsky.feed.post/rkey')).toBe(
      true
    );
    expect(isValidNip48KnownProxyId('rss', 'https://example.com/feed.xml')).toBe(false);
    expect(isValidNip48KnownProxyId('web', 'not a url')).toBe(false);
    expect(resolveNip48ProxySourceUrl('web', 'https://example.com/source')).toBe(
      'https://example.com/source'
    );
    expect(resolveNip48ProxySourceUrl('atproto', 'at://did:plc:abc/app.bsky.feed.post/rkey')).toBe(
      null
    );
  });

  it('ignores malformed proxy tags when parsing', () => {
    expect(parseNip48ProxyTag(['proxy', ' ', 'web'])).toBeNull();
    expect(parseNip48ProxyTag(['proxy', 'https://example.com/source', ' '])).toBeNull();
    expect(parseNip48ProxyTag(['e', 'https://example.com/source', 'web'])).toBeNull();
    expect(
      parseNip48ProxyTags([
        ['proxy', 'https://example.com/source', 'web'],
        ['proxy', ' ', 'web']
      ])
    ).toHaveLength(1);
  });

  it('rejects empty values and invalid known protocol IDs when building', () => {
    expect(() => buildNip48ProxyTag({ id: '', protocol: 'web' })).toThrow(
      'NIP-48 proxy id must not be empty'
    );
    expect(() => buildNip48ProxyTag({ id: 'https://example.com/source', protocol: '' })).toThrow(
      'NIP-48 proxy protocol must not be empty'
    );
    expect(() => buildNip48ProxyTag({ id: 'not a url', protocol: 'web' })).toThrow(
      'NIP-48 web proxy id has invalid format'
    );
    expect(() =>
      buildNip48ProxyTag({ id: 'https://example.com/feed.xml', protocol: 'rss' })
    ).toThrow('NIP-48 rss proxy id has invalid format');
  });
});
