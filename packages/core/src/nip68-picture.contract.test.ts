import { describe, expect, it } from 'vitest';

import {
  buildNip68AnnotatedUserEntry,
  buildNip68HashtagTag,
  buildNip68ImetaTag,
  buildNip68PictureEvent,
  buildNip68TaggedPubkeyTag,
  isNip68AcceptedMediaType,
  NIP68_ACCEPTED_MEDIA_TYPES,
  NIP68_IMETA_TAG,
  NIP68_PICTURE_EVENT_KIND,
  parseNip68AnnotatedUserEntry,
  parseNip68ImetaTag,
  parseNip68PictureEvent,
  parseNip68TaggedPubkeyTags
} from './index.js';

describe('NIP-68 picture-first feeds', () => {
  it('builds and parses picture events with self-contained imeta images', () => {
    const event = buildNip68PictureEvent({
      title: 'Costa Rica coast',
      content: 'A scenic photo overlooking the coast of Costa Rica',
      images: [
        {
          url: 'https://nostr.build/i/my-image.jpg',
          mediaType: 'image/jpeg',
          blurhash: 'eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
          dimensions: '3024x4032',
          alt: 'A scenic photo overlooking the coast of Costa Rica',
          hash: 'hash-one',
          fallbacks: ['https://nostrcheck.me/alt1.jpg', 'https://void.cat/alt1.jpg']
        },
        {
          url: 'https://nostr.build/i/my-image2.jpg',
          mediaType: 'image/png',
          alt: 'Another scenic photo overlooking the coast of Costa Rica',
          hash: 'hash-two',
          annotatedUsers: [{ pubkey: 'bob', x: '0.25', y: '0.75' }]
        }
      ],
      contentWarning: 'nsfw',
      taggedPubkeys: [{ pubkey: 'bob', relayHint: 'wss://relay' }],
      hashtags: ['photography', '#costarica'],
      location: 'Costa Rica',
      geohash: 'd1g',
      language: { code: 'en' },
      tags: [
        ['m', 'image/gif'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP68_PICTURE_EVENT_KIND,
      content: 'A scenic photo overlooking the coast of Costa Rica',
      tags: [
        ['title', 'Costa Rica coast'],
        [
          NIP68_IMETA_TAG,
          'url https://nostr.build/i/my-image.jpg',
          'm image/jpeg',
          'blurhash eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
          'dim 3024x4032',
          'alt A scenic photo overlooking the coast of Costa Rica',
          'x hash-one',
          'fallback https://nostrcheck.me/alt1.jpg',
          'fallback https://void.cat/alt1.jpg'
        ],
        [
          NIP68_IMETA_TAG,
          'url https://nostr.build/i/my-image2.jpg',
          'm image/png',
          'alt Another scenic photo overlooking the coast of Costa Rica',
          'x hash-two',
          'annotate-user bob:0.25:0.75'
        ],
        ['content-warning', 'nsfw'],
        ['p', 'bob', 'wss://relay'],
        ['m', 'image/jpeg'],
        ['m', 'image/png'],
        ['x', 'hash-one'],
        ['x', 'hash-two'],
        ['t', 'photography'],
        ['t', 'costarica'],
        ['location', 'Costa Rica'],
        ['g', 'd1g'],
        ['L', 'ISO-639-1'],
        ['l', 'en', 'ISO-639-1'],
        ['client', 'resonote']
      ]
    });

    expect(parseNip68PictureEvent({ ...event, pubkey: 'alice', created_at: 123 })).toEqual({
      kind: NIP68_PICTURE_EVENT_KIND,
      title: 'Costa Rica coast',
      content: 'A scenic photo overlooking the coast of Costa Rica',
      images: [
        {
          url: 'https://nostr.build/i/my-image.jpg',
          mediaType: 'image/jpeg',
          blurhash: 'eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
          dimensions: '3024x4032',
          alt: 'A scenic photo overlooking the coast of Costa Rica',
          hash: 'hash-one',
          fallbacks: ['https://nostrcheck.me/alt1.jpg', 'https://void.cat/alt1.jpg'],
          annotatedUsers: [],
          fields: [],
          tag: event.tags[1]
        },
        {
          url: 'https://nostr.build/i/my-image2.jpg',
          mediaType: 'image/png',
          blurhash: null,
          dimensions: null,
          alt: 'Another scenic photo overlooking the coast of Costa Rica',
          hash: 'hash-two',
          fallbacks: [],
          annotatedUsers: [{ pubkey: 'bob', x: '0.25', y: '0.75' }],
          fields: [],
          tag: event.tags[2]
        }
      ],
      contentWarning: { reason: 'nsfw' },
      taggedPubkeys: [{ pubkey: 'bob', relayHint: 'wss://relay' }],
      mediaTypes: ['image/jpeg', 'image/png'],
      hashes: ['hash-one', 'hash-two'],
      hashtags: ['photography', 'costarica'],
      location: 'Costa Rica',
      geohash: 'd1g',
      language: { code: 'en', namespace: 'ISO-639-1' },
      customTags: [['client', 'resonote']],
      pubkey: 'alice',
      createdAt: 123
    });
  });

  it('exposes imeta and tag helpers', () => {
    expect(NIP68_ACCEPTED_MEDIA_TYPES).toContain('image/webp');
    expect(isNip68AcceptedMediaType('image/avif')).toBe(true);
    expect(isNip68AcceptedMediaType('video/mp4')).toBe(false);
    expect(
      buildNip68ImetaTag({
        url: 'https://nostr.build/i/picture.webp',
        mediaType: 'image/webp',
        fields: [
          { name: 'service', value: 'nostr.build' },
          { name: 'url', value: 'https://ignored.example/picture.webp' }
        ]
      })
    ).toEqual([
      NIP68_IMETA_TAG,
      'url https://nostr.build/i/picture.webp',
      'm image/webp',
      'service nostr.build'
    ]);
    expect(buildNip68AnnotatedUserEntry({ pubkey: 'bob', x: 10, y: 20 })).toBe(
      'annotate-user bob:10:20'
    );
    expect(parseNip68AnnotatedUserEntry('bob:10:20')).toEqual({
      pubkey: 'bob',
      x: '10',
      y: '20'
    });
    expect(buildNip68TaggedPubkeyTag({ pubkey: 'bob' })).toEqual(['p', 'bob']);
    expect(parseNip68TaggedPubkeyTags([['p', 'bob', 'wss://relay']])).toEqual([
      { pubkey: 'bob', relayHint: 'wss://relay' }
    ]);
    expect(buildNip68HashtagTag('#Photography')).toEqual(['t', 'Photography']);
  });

  it('parses custom imeta fields and rejects malformed picture events', () => {
    expect(
      parseNip68ImetaTag([
        'imeta',
        'url https://nostr.build/i/picture.webp',
        'm image/webp',
        'service nostr.build',
        'annotate-user malformed'
      ])
    ).toEqual({
      url: 'https://nostr.build/i/picture.webp',
      mediaType: 'image/webp',
      blurhash: null,
      dimensions: null,
      alt: null,
      hash: null,
      fallbacks: [],
      annotatedUsers: [],
      fields: [{ name: 'service', value: 'nostr.build' }],
      tag: [
        'imeta',
        'url https://nostr.build/i/picture.webp',
        'm image/webp',
        'service nostr.build',
        'annotate-user malformed'
      ]
    });
    expect(
      parseNip68ImetaTag(['imeta', 'url https://example.com/a.jpg', 'm video/mp4'])
    ).toBeNull();
    expect(parseNip68PictureEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip68PictureEvent({ kind: 20, content: '', tags: [] })).toBeNull();
    expect(
      parseNip68PictureEvent({
        kind: 20,
        content: '',
        tags: [['title', 'No image']]
      })
    ).toBeNull();
    expect(() =>
      buildNip68PictureEvent({
        title: 'No image',
        images: []
      })
    ).toThrow('NIP-68 picture event requires at least one image');
    expect(() =>
      buildNip68ImetaTag({
        url: 'https://example.com/a.mp4',
        mediaType: 'video/mp4' as never
      })
    ).toThrow('NIP-68 unsupported image media type: video/mp4');
  });
});
