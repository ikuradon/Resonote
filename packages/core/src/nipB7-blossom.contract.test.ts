import { describe, expect, it } from 'vitest';

import {
  buildNipB7BlossomFallbackUrls,
  buildNipB7BlossomFileUrl,
  buildNipB7BlossomServerListEvent,
  buildNipB7BlossomServerListFilter,
  buildNipB7BlossomServerTag,
  calculateNipB7BlossomContentHash,
  extractNipB7BlossomHashFromUrl,
  NIPB7_BLOSSOM_SERVER_LIST_KIND,
  parseNipB7BlossomServerListEvent,
  parseNipB7BlossomServerTags,
  verifyNipB7BlossomContentHash
} from './index.js';

describe('NIP-B7 Blossom media helpers', () => {
  const pubkey = 'a'.repeat(64);
  const hash = 'b'.repeat(64);

  it('builds and parses kind:10063 Blossom server lists', () => {
    const event = buildNipB7BlossomServerListEvent({
      servers: ['https://blossom.example/', 'https://cdn.example/path?ignored=1'],
      tags: [
        ['server', 'ignored'],
        ['client', 'resonote']
      ]
    });
    expect(event).toEqual({
      kind: NIPB7_BLOSSOM_SERVER_LIST_KIND,
      content: '',
      tags: [
        ['server', 'https://blossom.example'],
        ['server', 'https://cdn.example/path'],
        ['client', 'resonote']
      ]
    });
    expect(parseNipB7BlossomServerListEvent({ ...event, pubkey, created_at: 123 })).toEqual({
      kind: NIPB7_BLOSSOM_SERVER_LIST_KIND,
      servers: ['https://blossom.example', 'https://cdn.example/path'],
      customTags: [['client', 'resonote']],
      pubkey,
      createdAt: 123,
      id: null
    });
  });

  it('extracts sha256 file ids from URLs and builds fallback URLs', () => {
    const original = `https://gone.example/media/${hash}.png`;
    expect(extractNipB7BlossomHashFromUrl(original)).toEqual({ hash, extension: '.png' });
    expect(extractNipB7BlossomHashFromUrl(`https://gone.example/${hash}`)).toEqual({
      hash,
      extension: null
    });
    expect(buildNipB7BlossomFileUrl('https://blossom.example/', hash.toUpperCase(), 'webp')).toBe(
      `https://blossom.example/${hash}.webp`
    );
    expect(
      buildNipB7BlossomFallbackUrls(original, [
        'https://blossom.example',
        'https://cdn.example/base/'
      ])
    ).toEqual([`https://blossom.example/${hash}.png`, `https://cdn.example/base/${hash}.png`]);
    expect(buildNipB7BlossomFallbackUrls(original, [])).toEqual([]);
  });

  it('verifies downloaded content hashes against extracted sha256 ids', () => {
    const bytes = new TextEncoder().encode('blossom');
    const contentHash = calculateNipB7BlossomContentHash(bytes);

    expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyNipB7BlossomContentHash(bytes.buffer, contentHash.toUpperCase())).toBe(true);
    expect(verifyNipB7BlossomContentHash(bytes, '0'.repeat(64))).toBe(false);
  });

  it('builds relay filters and parses server tags', () => {
    expect(buildNipB7BlossomServerTag('https://blossom.example/')).toEqual([
      'server',
      'https://blossom.example'
    ]);
    expect(parseNipB7BlossomServerTags([['server', 'https://blossom.example/']])).toEqual([
      'https://blossom.example'
    ]);
    expect(
      buildNipB7BlossomServerListFilter({
        authors: [pubkey],
        since: 10,
        until: 20,
        limit: 5
      })
    ).toEqual({
      kinds: [NIPB7_BLOSSOM_SERVER_LIST_KIND],
      authors: [pubkey],
      since: 10,
      until: 20,
      limit: 5
    });
  });

  it('rejects invalid server URLs and non-Blossom file URLs', () => {
    expect(() => buildNipB7BlossomServerListEvent({ servers: [] })).toThrow(/at least one/);
    expect(() => buildNipB7BlossomServerTag('http://blossom.example')).toThrow(/https/);
    expect(() => buildNipB7BlossomFileUrl('https://blossom.example', 'not-hex')).toThrow(/SHA-256/);
    expect(extractNipB7BlossomHashFromUrl('https://example.com/no-hash.png')).toBeNull();
    expect(extractNipB7BlossomHashFromUrl('https://example.com/%zz')).toBeNull();
    expect(parseNipB7BlossomServerListEvent({ kind: 1, tags: [] })).toBeNull();
    expect(
      parseNipB7BlossomServerListEvent({
        kind: NIPB7_BLOSSOM_SERVER_LIST_KIND,
        tags: [['server', 'not-url']]
      })
    ).toBeNull();
  });
});
