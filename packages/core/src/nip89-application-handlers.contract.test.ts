import { describe, expect, it } from 'vitest';

import {
  buildNip89ClientTag,
  buildNip89HandlerAddress,
  buildNip89HandlerInformationEvent,
  buildNip89HandlerInformationFilter,
  buildNip89HandlerPointerTag,
  buildNip89PlatformHandlerTag,
  buildNip89RecommendationEvent,
  buildNip89RecommendationFilter,
  NIP89_CLIENT_TAG,
  NIP89_HANDLER_INFORMATION_KIND,
  NIP89_RECOMMENDATION_KIND,
  parseNip89ClientTag,
  parseNip89HandlerInformationEvent,
  parseNip89HandlerMetadataJson,
  parseNip89HandlerPointerTag,
  parseNip89PlatformHandlerTag,
  parseNip89RecommendationEvent
} from './index.js';

describe('NIP-89 recommended application handlers', () => {
  it('builds and parses recommendation events', () => {
    const event = buildNip89RecommendationEvent({
      eventKind: 31337,
      handlers: [
        {
          pubkey: 'app1',
          identifier: 'zapstr',
          relayHint: 'wss://relay1',
          platform: 'web'
        },
        {
          pubkey: 'app2',
          identifier: 'zapstr-ios',
          relayHint: 'wss://relay2',
          platform: 'ios'
        }
      ],
      tags: [
        ['a', 'ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP89_RECOMMENDATION_KIND,
      content: '',
      tags: [
        ['d', '31337'],
        ['a', '31990:app1:zapstr', 'wss://relay1', 'web'],
        ['a', '31990:app2:zapstr-ios', 'wss://relay2', 'ios'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip89RecommendationEvent({ ...event, pubkey: 'alice', created_at: 123 })).toEqual({
      eventKind: 31337,
      handlers: [
        {
          pubkey: 'app1',
          identifier: 'zapstr',
          address: '31990:app1:zapstr',
          relayHint: 'wss://relay1',
          platform: 'web'
        },
        {
          pubkey: 'app2',
          identifier: 'zapstr-ios',
          address: '31990:app2:zapstr-ios',
          relayHint: 'wss://relay2',
          platform: 'ios'
        }
      ],
      content: '',
      customTags: [['client', 'resonote']],
      pubkey: 'alice',
      createdAt: 123
    });
  });

  it('builds and parses handler information events with metadata and URL templates', () => {
    const event = buildNip89HandlerInformationEvent({
      identifier: 'zapstr',
      supportedKinds: [31337, '1'],
      metadata: {
        name: 'Zapstr',
        picture: 'https://example.com/logo.png'
      },
      handlers: [
        { platform: 'web', urlTemplate: 'https://zapstr.example/a/<bech32>', entityType: 'naddr' },
        { platform: 'web', urlTemplate: 'https://zapstr.example/e/<bech32>', entityType: 'nevent' },
        { platform: 'ios', urlTemplate: 'zapstr://<bech32>' }
      ],
      tags: [
        ['k', '999'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP89_HANDLER_INFORMATION_KIND,
      content: JSON.stringify({
        name: 'Zapstr',
        picture: 'https://example.com/logo.png'
      }),
      tags: [
        ['d', 'zapstr'],
        ['k', '31337'],
        ['k', '1'],
        ['web', 'https://zapstr.example/a/<bech32>', 'naddr'],
        ['web', 'https://zapstr.example/e/<bech32>', 'nevent'],
        ['ios', 'zapstr://<bech32>'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip89HandlerInformationEvent({ ...event, pubkey: 'app', created_at: 456 })).toEqual(
      {
        identifier: 'zapstr',
        supportedKinds: [31337, 1],
        handlers: [
          {
            platform: 'web',
            urlTemplate: 'https://zapstr.example/a/<bech32>',
            entityType: 'naddr'
          },
          {
            platform: 'web',
            urlTemplate: 'https://zapstr.example/e/<bech32>',
            entityType: 'nevent'
          },
          { platform: 'ios', urlTemplate: 'zapstr://<bech32>', entityType: null }
        ],
        content: JSON.stringify({
          name: 'Zapstr',
          picture: 'https://example.com/logo.png'
        }),
        metadata: {
          name: 'Zapstr',
          picture: 'https://example.com/logo.png'
        },
        customTags: [['client', 'resonote']],
        pubkey: 'app',
        createdAt: 456
      }
    );
  });

  it('exposes pointer, client tag, metadata, and filter helpers', () => {
    expect(buildNip89HandlerAddress({ pubkey: 'app', identifier: 'handler' })).toBe(
      '31990:app:handler'
    );
    expect(buildNip89HandlerPointerTag({ pubkey: 'app', identifier: 'handler' })).toEqual([
      'a',
      '31990:app:handler'
    ]);
    expect(parseNip89HandlerPointerTag(['a', '31990:app:handler', 'wss://relay', 'web'])).toEqual({
      pubkey: 'app',
      identifier: 'handler',
      address: '31990:app:handler',
      relayHint: 'wss://relay',
      platform: 'web'
    });
    expect(
      buildNip89PlatformHandlerTag({
        platform: 'web',
        urlTemplate: 'https://example.com/<bech32>'
      })
    ).toEqual(['web', 'https://example.com/<bech32>']);
    expect(parseNip89PlatformHandlerTag(['web', 'https://example.com/<bech32>', 'nevent'])).toEqual(
      {
        platform: 'web',
        urlTemplate: 'https://example.com/<bech32>',
        entityType: 'nevent'
      }
    );
    expect(
      buildNip89ClientTag({
        name: 'My Client',
        handlerAddress: '31990:app:handler',
        relayHint: 'wss://relay'
      })
    ).toEqual([NIP89_CLIENT_TAG, 'My Client', '31990:app:handler', 'wss://relay']);
    expect(parseNip89ClientTag(['client', 'My Client', '31990:app:handler'])).toEqual({
      name: 'My Client',
      handlerAddress: '31990:app:handler',
      relayHint: null
    });
    expect(parseNip89HandlerMetadataJson('{"name":"Zapstr"}')).toEqual({ name: 'Zapstr' });
    expect(buildNip89RecommendationFilter({ eventKind: 31337, authors: ['alice'] })).toEqual({
      kinds: [NIP89_RECOMMENDATION_KIND],
      '#d': ['31337'],
      authors: ['alice']
    });
    expect(buildNip89HandlerInformationFilter({ eventKind: 31337 })).toEqual({
      kinds: [NIP89_HANDLER_INFORMATION_KIND],
      '#k': ['31337']
    });
  });

  it('rejects malformed handler events', () => {
    expect(parseNip89RecommendationEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip89RecommendationEvent({ kind: 31989, content: '', tags: [] })).toBeNull();
    expect(parseNip89HandlerInformationEvent({ kind: 31990, content: '', tags: [] })).toBeNull();
    expect(parseNip89ClientTag(['client', 'Only Name'])).toBeNull();
    expect(parseNip89HandlerMetadataJson('not-json')).toBeNull();
    expect(() =>
      buildNip89RecommendationEvent({
        eventKind: 1,
        handlers: []
      })
    ).toThrow('NIP-89 recommendation requires at least one handler');
    expect(() =>
      buildNip89HandlerInformationEvent({
        identifier: 'handler',
        supportedKinds: [],
        handlers: [{ platform: 'web', urlTemplate: 'https://example.com/<bech32>' }]
      })
    ).toThrow('NIP-89 handler information requires at least one supported kind');
    expect(() =>
      buildNip89HandlerInformationEvent({
        identifier: 'handler',
        supportedKinds: [1],
        handlers: []
      })
    ).toThrow('NIP-89 handler information requires at least one platform handler');
  });
});
