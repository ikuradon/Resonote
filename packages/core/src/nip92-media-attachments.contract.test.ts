import { describe, expect, it } from 'vitest';

import {
  buildNip92ImetaTag,
  buildNip92MediaAttachmentTags,
  dedupeNip92MediaAttachmentsByUrl,
  filterNip92ReferencedMediaAttachments,
  hasNip92MediaAttachments,
  isNip92MediaAttachmentUrlReferenced,
  NIP92_IMETA_TAG,
  parseNip92Dimensions,
  parseNip92ImetaEntry,
  parseNip92ImetaTag,
  parseNip92MediaAttachments,
  withNip92MediaAttachments
} from './index.js';

describe('NIP-92 media attachments', () => {
  const hash = 'a'.repeat(64);
  const originalHash = 'b'.repeat(64);
  const thumbHash = 'c'.repeat(64);

  it('builds and parses imeta tags with NIP-94 file metadata fields', () => {
    const tag = buildNip92ImetaTag({
      url: 'https://nostr.build/i/my-image.jpg',
      mediaType: 'IMAGE/JPEG',
      hash: hash.toUpperCase(),
      originalHash,
      size: '001024',
      dimensions: '3024x4032',
      magnet: 'magnet:?xt=urn:btih:abc',
      torrentInfoHash: 'torrent-infohash',
      blurhash: 'eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
      thumb: {
        url: 'https://cdn.example/thumb.jpg',
        hash: thumbHash.toUpperCase()
      },
      image: 'https://cdn.example/preview.jpg',
      summary: 'A coastline excerpt',
      alt: 'A scenic photo overlooking the coast of Costa Rica',
      fallbacks: ['https://nostrcheck.me/alt1.jpg', 'https://void.cat/alt1.jpg'],
      service: 'nip96',
      fields: [
        { name: 'custom', value: 'kept' },
        { name: 'url', value: 'ignored' },
        { name: 'm', value: 'ignored' }
      ]
    });

    expect(tag).toEqual([
      NIP92_IMETA_TAG,
      'url https://nostr.build/i/my-image.jpg',
      'm image/jpeg',
      `x ${hash}`,
      `ox ${originalHash}`,
      'size 1024',
      'dim 3024x4032',
      'magnet magnet:?xt=urn:btih:abc',
      'i torrent-infohash',
      'blurhash eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
      `thumb https://cdn.example/thumb.jpg ${thumbHash}`,
      'image https://cdn.example/preview.jpg',
      'summary A coastline excerpt',
      'alt A scenic photo overlooking the coast of Costa Rica',
      'fallback https://nostrcheck.me/alt1.jpg',
      'fallback https://void.cat/alt1.jpg',
      'service nip96',
      'custom kept'
    ]);

    expect(parseNip92ImetaTag(tag)).toEqual({
      url: 'https://nostr.build/i/my-image.jpg',
      mediaType: 'image/jpeg',
      hash,
      originalHash,
      size: 1024,
      sizeText: '1024',
      dimensions: '3024x4032',
      parsedDimensions: { width: 3024, height: 4032 },
      magnet: 'magnet:?xt=urn:btih:abc',
      torrentInfoHash: 'torrent-infohash',
      blurhash: 'eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
      thumb: {
        url: 'https://cdn.example/thumb.jpg',
        hash: thumbHash,
        value: `https://cdn.example/thumb.jpg ${thumbHash}`
      },
      image: {
        url: 'https://cdn.example/preview.jpg',
        hash: null,
        value: 'https://cdn.example/preview.jpg'
      },
      summary: 'A coastline excerpt',
      alt: 'A scenic photo overlooking the coast of Costa Rica',
      fallbacks: ['https://nostrcheck.me/alt1.jpg', 'https://void.cat/alt1.jpg'],
      service: 'nip96',
      fields: [{ name: 'custom', value: 'kept' }],
      tag
    });
  });

  it('filters content-matched attachments and dedupes one imeta per URL', () => {
    const matching = buildNip92ImetaTag({
      url: 'https://example.com/inline.jpg',
      mediaType: 'image/jpeg'
    });
    const duplicate = buildNip92ImetaTag({
      url: 'https://example.com/inline.jpg',
      alt: 'duplicate'
    });
    const unmatched = buildNip92ImetaTag({
      url: 'https://example.com/missing.jpg',
      mediaType: 'image/jpeg'
    });
    const event = {
      content: 'inline media https://example.com/inline.jpg',
      tags: [matching, duplicate, unmatched]
    };

    const all = parseNip92MediaAttachments(event);
    expect(all).toHaveLength(3);
    expect(parseNip92MediaAttachments(event, { requireContentMatch: true })).toHaveLength(2);
    expect(
      parseNip92MediaAttachments(event, { requireContentMatch: true, uniqueByUrl: true })
    ).toEqual([expect.objectContaining({ url: 'https://example.com/inline.jpg' })]);
    expect(filterNip92ReferencedMediaAttachments(event.content, all)).toHaveLength(2);
    expect(dedupeNip92MediaAttachmentsByUrl(all).map((attachment) => attachment.url)).toEqual([
      'https://example.com/inline.jpg',
      'https://example.com/missing.jpg'
    ]);
    expect(isNip92MediaAttachmentUrlReferenced(event.content, all[0])).toBe(true);
    expect(isNip92MediaAttachmentUrlReferenced(event.content, all[2])).toBe(false);
    expect(hasNip92MediaAttachments(event, { requireContentMatch: true })).toBe(true);
  });

  it('attaches media tags to event content and enforces content URLs by default', () => {
    expect(
      withNip92MediaAttachments({
        content: 'More image metadata https://nostr.build/i/my-image.jpg',
        tags: [['client', 'resonote']],
        attachments: [
          {
            url: 'https://nostr.build/i/my-image.jpg',
            mediaType: 'image/jpeg',
            alt: 'A scenic photo'
          }
        ]
      })
    ).toEqual({
      content: 'More image metadata https://nostr.build/i/my-image.jpg',
      tags: [
        ['client', 'resonote'],
        ['imeta', 'url https://nostr.build/i/my-image.jpg', 'm image/jpeg', 'alt A scenic photo']
      ]
    });

    expect(() =>
      withNip92MediaAttachments({
        content: 'missing URL',
        attachments: [{ url: 'https://example.com/file.jpg', mediaType: 'image/jpeg' }]
      })
    ).toThrow('NIP-92 attachment URL is not present in content: https://example.com/file.jpg');

    expect(
      withNip92MediaAttachments({
        content: 'metadata-only draft',
        requireContentMatch: false,
        attachments: [{ url: 'https://example.com/file.jpg', mediaType: 'image/jpeg' }]
      }).tags
    ).toEqual([['imeta', 'url https://example.com/file.jpg', 'm image/jpeg']]);
  });

  it('exposes tag helpers and rejects malformed imeta data', () => {
    expect(
      buildNip92MediaAttachmentTags([{ url: 'https://example.com/a.mp4', mediaType: 'video/mp4' }])
    ).toEqual([['imeta', 'url https://example.com/a.mp4', 'm video/mp4']]);
    expect(parseNip92ImetaEntry('alt readable text')).toEqual({
      name: 'alt',
      value: 'readable text'
    });
    expect(parseNip92ImetaEntry('invalid')).toBeNull();
    expect(parseNip92Dimensions('640x360')).toEqual({ width: 640, height: 360 });
    expect(parseNip92Dimensions('0x360')).toBeNull();
    expect(parseNip92ImetaTag(['e', 'id'])).toBeNull();
    expect(parseNip92ImetaTag(['imeta', 'url https://example.com/file.jpg'])).toBeNull();
    expect(parseNip92ImetaTag(['imeta', 'm image/jpeg'])).toBeNull();
    expect(() => buildNip92ImetaTag({ url: 'https://example.com/file.jpg' })).toThrow(
      'NIP-92 imeta tag requires a url and at least one metadata field'
    );
    expect(() =>
      buildNip92ImetaTag({
        url: 'https://example.com/file.jpg',
        hash: 'not-a-sha256'
      })
    ).toThrow('NIP-92 file hash must be SHA-256 hex');
    expect(() =>
      buildNip92ImetaTag({
        url: 'https://example.com/file.jpg',
        mediaType: 'image/jpeg',
        size: -1
      })
    ).toThrow('NIP-92 file size must be a non-negative safe integer');
    expect(() =>
      buildNip92ImetaTag({
        url: 'https://example.com/file.jpg',
        mediaType: 'image/jpeg',
        dimensions: '640:360'
      })
    ).toThrow('NIP-92 dimensions must use <width>x<height>');
  });
});
