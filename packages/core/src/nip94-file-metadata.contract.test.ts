import { describe, expect, it } from 'vitest';

import {
  buildNip94FallbackTag,
  buildNip94FileMetadataEvent,
  buildNip94FileMetadataFilter,
  buildNip94HashTag,
  buildNip94ImageTag,
  buildNip94MediaTypeTag,
  buildNip94OriginalHashTag,
  buildNip94ThumbTag,
  buildNip94UrlTag,
  NIP94_FILE_METADATA_KIND,
  parseNip94Dimensions,
  parseNip94FileMetadataEvent,
  parseNip94PreviewResourceTag
} from './index.js';

describe('NIP-94 file metadata', () => {
  const hash = 'a'.repeat(64);
  const originalHash = 'b'.repeat(64);
  const thumbHash = 'c'.repeat(64);
  const imageHash = 'd'.repeat(64);

  it('builds and parses kind:1063 file metadata events', () => {
    const event = buildNip94FileMetadataEvent({
      url: 'https://files.example/photo.jpg',
      mediaType: 'IMAGE/JPEG',
      hash: hash.toUpperCase(),
      description: 'A file caption',
      originalHash,
      size: '001024',
      dimensions: '3024x4032',
      magnet: 'magnet:?xt=urn:btih:abc',
      torrentInfoHash: 'torrent-infohash',
      blurhash: 'eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$',
      thumb: {
        url: 'https://files.example/thumb.jpg',
        hash: thumbHash.toUpperCase()
      },
      image: {
        url: 'https://files.example/preview.jpg',
        hash: imageHash
      },
      summary: 'A short excerpt',
      alt: 'A scenic photo overlooking the coast',
      fallbacks: ['https://fallback.example/photo.jpg', 'ipfs://photo'],
      service: 'nip96',
      tags: [
        ['m', 'ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP94_FILE_METADATA_KIND,
      content: 'A file caption',
      tags: [
        ['url', 'https://files.example/photo.jpg'],
        ['m', 'image/jpeg'],
        ['x', hash],
        ['ox', originalHash],
        ['size', '1024'],
        ['dim', '3024x4032'],
        ['magnet', 'magnet:?xt=urn:btih:abc'],
        ['i', 'torrent-infohash'],
        ['blurhash', 'eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$'],
        ['thumb', 'https://files.example/thumb.jpg', thumbHash],
        ['image', 'https://files.example/preview.jpg', imageHash],
        ['summary', 'A short excerpt'],
        ['alt', 'A scenic photo overlooking the coast'],
        ['fallback', 'https://fallback.example/photo.jpg'],
        ['fallback', 'ipfs://photo'],
        ['service', 'nip96'],
        ['client', 'resonote']
      ]
    });
    expect(
      parseNip94FileMetadataEvent({ ...event, pubkey: 'alice', created_at: 123, id: 'id' })
    ).toEqual({
      kind: NIP94_FILE_METADATA_KIND,
      description: 'A file caption',
      url: 'https://files.example/photo.jpg',
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
        url: 'https://files.example/thumb.jpg',
        hash: thumbHash
      },
      image: {
        url: 'https://files.example/preview.jpg',
        hash: imageHash
      },
      summary: 'A short excerpt',
      alt: 'A scenic photo overlooking the coast',
      fallbacks: ['https://fallback.example/photo.jpg', 'ipfs://photo'],
      service: 'nip96',
      customTags: [['client', 'resonote']],
      pubkey: 'alice',
      createdAt: 123,
      id: 'id'
    });
  });

  it('builds file metadata relay filters', () => {
    expect(
      buildNip94FileMetadataFilter({
        hashes: [hash.toUpperCase()],
        mediaTypes: ['IMAGE/JPEG'],
        authors: ['alice'],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIP94_FILE_METADATA_KIND],
      '#x': [hash],
      '#m': ['image/jpeg'],
      authors: ['alice'],
      since: 10,
      until: 20,
      limit: 5
    });
  });

  it('exposes tag helpers and parsers', () => {
    expect(buildNip94UrlTag('https://files.example/photo.jpg')).toEqual([
      'url',
      'https://files.example/photo.jpg'
    ]);
    expect(buildNip94MediaTypeTag('IMAGE/PNG')).toEqual(['m', 'image/png']);
    expect(buildNip94HashTag(hash.toUpperCase())).toEqual(['x', hash]);
    expect(buildNip94OriginalHashTag(originalHash.toUpperCase())).toEqual(['ox', originalHash]);
    expect(buildNip94ThumbTag({ url: 'https://files.example/thumb.jpg', hash: thumbHash })).toEqual(
      ['thumb', 'https://files.example/thumb.jpg', thumbHash]
    );
    expect(buildNip94ImageTag('https://files.example/preview.jpg')).toEqual([
      'image',
      'https://files.example/preview.jpg'
    ]);
    expect(buildNip94FallbackTag('https://fallback.example/photo.jpg')).toEqual([
      'fallback',
      'https://fallback.example/photo.jpg'
    ]);
    expect(parseNip94PreviewResourceTag(['thumb', 'https://files.example/thumb.jpg'])).toEqual({
      url: 'https://files.example/thumb.jpg',
      hash: null
    });
    expect(parseNip94PreviewResourceTag(['e', 'id'])).toBeNull();
    expect(parseNip94Dimensions('640x360')).toEqual({ width: 640, height: 360 });
    expect(parseNip94Dimensions('0x360')).toBeNull();
  });

  it('rejects malformed file metadata events and builder input', () => {
    expect(parseNip94FileMetadataEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(
      parseNip94FileMetadataEvent({
        kind: NIP94_FILE_METADATA_KIND,
        content: '',
        tags: [
          ['url', 'https://files.example/photo.jpg'],
          ['m', 'image/jpeg']
        ]
      })
    ).toBeNull();
    expect(() =>
      buildNip94FileMetadataEvent({
        url: 'https://files.example/photo.jpg',
        mediaType: 'image/jpeg',
        hash: 'not-a-sha256'
      })
    ).toThrow('NIP-94 file hash must be SHA-256 hex');
    expect(() =>
      buildNip94FileMetadataEvent({
        url: 'https://files.example/photo.jpg',
        mediaType: 'image/jpeg',
        hash,
        size: -1
      })
    ).toThrow('NIP-94 file size must be a non-negative safe integer');
    expect(() =>
      buildNip94FileMetadataEvent({
        url: 'https://files.example/photo.jpg',
        mediaType: 'image/jpeg',
        hash,
        dimensions: '640:360'
      })
    ).toThrow('NIP-94 dimensions must use <width>x<height>');
    expect(() => buildNip94FileMetadataFilter({ limit: 1.5 })).toThrow(
      'NIP-94 filter limit must be a non-negative safe integer'
    );
  });
});
