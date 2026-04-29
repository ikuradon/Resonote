import { describe, expect, it } from 'vitest';

import {
  buildNip71AddressTag,
  buildNip71HashtagTag,
  buildNip71OriginTag,
  buildNip71ParticipantTag,
  buildNip71ReferenceTag,
  buildNip71SegmentTag,
  buildNip71TextTrackTag,
  buildNip71VideoEvent,
  buildNip71VideoVariantTag,
  isNip71AddressableVideoKind,
  isNip71VideoKind,
  NIP71_ADDRESSABLE_SHORT_VIDEO_KIND,
  NIP71_ADDRESSABLE_VIDEO_KIND,
  NIP71_IMETA_TAG,
  NIP71_SHORT_VIDEO_KIND,
  NIP71_VIDEO_KIND,
  parseNip71AddressTag,
  parseNip71OriginTag,
  parseNip71ParticipantTags,
  parseNip71SegmentTags,
  parseNip71TextTrackTags,
  parseNip71VideoEvent,
  parseNip71VideoVariantTag
} from './index.js';

describe('NIP-71 video events', () => {
  it('builds and parses normal video events with imeta variants', () => {
    const event = buildNip71VideoEvent({
      title: 'Launch demo',
      content: 'A summary of the video content',
      variants: [
        {
          url: 'https://myvideo.com/1080/12345.mp4',
          mediaType: 'video/mp4',
          dimensions: '1920x1080',
          hash: 'hash-1080',
          images: ['https://myvideo.com/1080/12345.jpg'],
          fallbacks: ['https://fallback.example/1080/12345.mp4'],
          service: 'nip96',
          bitrate: 3_000_000,
          duration: 29.223
        },
        {
          url: 'https://myvideo.com/720/12345.m3u8',
          mediaType: 'application/x-mpegURL',
          dimensions: '1280x720',
          hash: 'hash-hls',
          images: ['https://myvideo.com/720/12345.jpg'],
          duration: '29.21'
        }
      ],
      publishedAt: 123,
      alt: 'Accessible video description',
      duration: 30,
      contentWarning: 'spoiler',
      textTracks: [
        { value: 'https://example.com/captions.vtt', trackType: 'captions', language: 'en' }
      ],
      segments: [
        {
          start: '00:00:00.000',
          end: '00:00:10.000',
          title: 'Intro',
          thumbnailUrl: 'https://example.com/intro.jpg'
        }
      ],
      participants: [{ pubkey: 'bob', relayHint: 'wss://relay' }],
      hashtags: ['video', '#demo'],
      references: ['https://example.com/watch'],
      origin: {
        platform: 'youtube',
        externalId: 'abc123',
        originalUrl: 'https://youtube.example/watch?v=abc123',
        metadata: 'imported'
      },
      tags: [
        ['p', 'mallory'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP71_VIDEO_KIND,
      content: 'A summary of the video content',
      tags: [
        ['title', 'Launch demo'],
        ['published_at', '123'],
        ['alt', 'Accessible video description'],
        [
          NIP71_IMETA_TAG,
          'url https://myvideo.com/1080/12345.mp4',
          'm video/mp4',
          'dim 1920x1080',
          'x hash-1080',
          'image https://myvideo.com/1080/12345.jpg',
          'fallback https://fallback.example/1080/12345.mp4',
          'service nip96',
          'bitrate 3000000',
          'duration 29.223'
        ],
        [
          NIP71_IMETA_TAG,
          'url https://myvideo.com/720/12345.m3u8',
          'm application/x-mpegURL',
          'dim 1280x720',
          'x hash-hls',
          'image https://myvideo.com/720/12345.jpg',
          'duration 29.21'
        ],
        ['duration', '30'],
        ['content-warning', 'spoiler'],
        ['text-track', 'https://example.com/captions.vtt', 'captions', 'en'],
        ['segment', '00:00:00.000', '00:00:10.000', 'Intro', 'https://example.com/intro.jpg'],
        ['origin', 'youtube', 'abc123', 'https://youtube.example/watch?v=abc123', 'imported'],
        ['p', 'bob', 'wss://relay'],
        ['t', 'video'],
        ['t', 'demo'],
        ['r', 'https://example.com/watch'],
        ['client', 'resonote']
      ]
    });

    expect(parseNip71VideoEvent({ ...event, pubkey: 'alice', created_at: 456 })).toEqual({
      kind: NIP71_VIDEO_KIND,
      identifier: null,
      title: 'Launch demo',
      content: 'A summary of the video content',
      variants: [
        {
          url: 'https://myvideo.com/1080/12345.mp4',
          mediaType: 'video/mp4',
          dimensions: '1920x1080',
          hash: 'hash-1080',
          blurhash: null,
          images: ['https://myvideo.com/1080/12345.jpg'],
          fallbacks: ['https://fallback.example/1080/12345.mp4'],
          service: 'nip96',
          bitrate: 3_000_000,
          duration: 29.223,
          fields: [],
          tag: event.tags[3]
        },
        {
          url: 'https://myvideo.com/720/12345.m3u8',
          mediaType: 'application/x-mpegURL',
          dimensions: '1280x720',
          hash: 'hash-hls',
          blurhash: null,
          images: ['https://myvideo.com/720/12345.jpg'],
          fallbacks: [],
          service: null,
          bitrate: null,
          duration: 29.21,
          fields: [],
          tag: event.tags[4]
        }
      ],
      publishedAt: 123,
      alt: 'Accessible video description',
      duration: 30,
      contentWarning: { reason: 'spoiler' },
      textTracks: [
        {
          value: 'https://example.com/captions.vtt',
          trackType: 'captions',
          language: 'en',
          relayHints: []
        }
      ],
      segments: [
        {
          start: '00:00:00.000',
          end: '00:00:10.000',
          title: 'Intro',
          thumbnailUrl: 'https://example.com/intro.jpg'
        }
      ],
      participants: [{ pubkey: 'bob', relayHint: 'wss://relay' }],
      hashtags: ['video', 'demo'],
      references: ['https://example.com/watch'],
      origin: {
        platform: 'youtube',
        externalId: 'abc123',
        originalUrl: 'https://youtube.example/watch?v=abc123',
        metadata: 'imported'
      },
      mediaTypes: ['video/mp4', 'application/x-mpegURL'],
      hashes: ['hash-1080', 'hash-hls'],
      customTags: [['client', 'resonote']],
      pubkey: 'alice',
      createdAt: 456
    });
  });

  it('builds and parses addressable video events and address tags', () => {
    const event = buildNip71VideoEvent({
      kind: NIP71_ADDRESSABLE_SHORT_VIDEO_KIND,
      identifier: 'launch-demo',
      title: 'Launch short',
      variants: [{ url: 'https://example.com/media.mp4', mediaType: 'video/mp4' }]
    });

    expect(event.tags[0]).toEqual(['d', 'launch-demo']);
    expect(parseNip71VideoEvent(event)?.identifier).toBe('launch-demo');
    expect(
      buildNip71AddressTag({
        kind: NIP71_ADDRESSABLE_VIDEO_KIND,
        pubkey: 'alice',
        identifier: 'launch-demo',
        relayHint: 'wss://relay'
      })
    ).toEqual(['a', '34235:alice:launch-demo', 'wss://relay']);
    expect(parseNip71AddressTag(['a', '34236:alice:short-demo'])).toEqual({
      kind: NIP71_ADDRESSABLE_SHORT_VIDEO_KIND,
      pubkey: 'alice',
      identifier: 'short-demo',
      value: '34236:alice:short-demo',
      relayHint: null
    });
  });

  it('exposes tag helpers and rejects malformed video events', () => {
    expect(isNip71VideoKind(NIP71_SHORT_VIDEO_KIND)).toBe(true);
    expect(isNip71AddressableVideoKind(NIP71_VIDEO_KIND)).toBe(false);
    expect(
      buildNip71VideoVariantTag({
        url: 'https://example.com/video.mp4',
        mediaType: 'video/mp4',
        fields: [{ name: 'license', value: 'cc0' }]
      })
    ).toEqual([NIP71_IMETA_TAG, 'url https://example.com/video.mp4', 'm video/mp4', 'license cc0']);
    expect(
      parseNip71VideoVariantTag(['imeta', 'url https://example.com/video.mp4', 'm video/mp4'])
    ).toEqual({
      url: 'https://example.com/video.mp4',
      mediaType: 'video/mp4',
      dimensions: null,
      hash: null,
      blurhash: null,
      images: [],
      fallbacks: [],
      service: null,
      bitrate: null,
      duration: null,
      fields: [],
      tag: ['imeta', 'url https://example.com/video.mp4', 'm video/mp4']
    });
    expect(
      buildNip71TextTrackTag({ value: 'track', trackType: 'captions', language: 'en' })
    ).toEqual(['text-track', 'track', 'captions', 'en']);
    expect(
      parseNip71TextTrackTags([['text-track', 'track', 'captions', 'en', 'wss://relay']])
    ).toEqual([
      { value: 'track', trackType: 'captions', language: 'en', relayHints: ['wss://relay'] }
    ]);
    expect(
      buildNip71SegmentTag({ start: '00:00:00.000', end: '00:00:01.000', title: 'One' })
    ).toEqual(['segment', '00:00:00.000', '00:00:01.000', 'One']);
    expect(parseNip71SegmentTags([['segment', '00:00:00.000', '00:00:01.000', 'One']])).toEqual([
      { start: '00:00:00.000', end: '00:00:01.000', title: 'One', thumbnailUrl: null }
    ]);
    expect(buildNip71ParticipantTag({ pubkey: 'bob' })).toEqual(['p', 'bob']);
    expect(parseNip71ParticipantTags([['p', 'bob', 'wss://relay']])).toEqual([
      { pubkey: 'bob', relayHint: 'wss://relay' }
    ]);
    expect(buildNip71HashtagTag('#Video')).toEqual(['t', 'Video']);
    expect(buildNip71ReferenceTag('https://example.com')).toEqual(['r', 'https://example.com']);
    expect(
      buildNip71OriginTag({
        platform: 'youtube',
        externalId: 'abc',
        originalUrl: 'https://example.com'
      })
    ).toEqual(['origin', 'youtube', 'abc', 'https://example.com']);
    expect(parseNip71OriginTag(['origin', 'youtube', 'abc', 'https://example.com'])).toEqual({
      platform: 'youtube',
      externalId: 'abc',
      originalUrl: 'https://example.com',
      metadata: null
    });
    expect(parseNip71VideoEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip71VideoEvent({ kind: 21, content: '', tags: [] })).toBeNull();
    expect(
      parseNip71VideoEvent({
        kind: NIP71_ADDRESSABLE_VIDEO_KIND,
        content: '',
        tags: [
          ['title', 'Missing d'],
          ['imeta', 'url https://example.com/video.mp4', 'm video/mp4']
        ]
      })
    ).toBeNull();
    expect(() =>
      buildNip71VideoEvent({
        kind: NIP71_ADDRESSABLE_VIDEO_KIND,
        title: 'Missing d',
        variants: [{ url: 'https://example.com/video.mp4', mediaType: 'video/mp4' }]
      })
    ).toThrow('NIP-71 addressable video identifier must not be empty');
    expect(() =>
      buildNip71VideoEvent({
        title: 'Missing variants',
        variants: []
      })
    ).toThrow('NIP-71 video event requires at least one imeta variant');
  });
});
