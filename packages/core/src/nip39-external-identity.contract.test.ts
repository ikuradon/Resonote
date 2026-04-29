import { describe, expect, it } from 'vitest';

import {
  buildNip39ExternalIdentitiesEvent,
  buildNip39ExternalIdentitiesFilter,
  buildNip39ExternalIdentityTag,
  buildNip39IdentityClaim,
  buildNip39ProofUrl,
  isNip39ExternalIdentitiesEvent,
  isNip39KnownPlatform,
  isNip39PlatformName,
  NIP39_EXTERNAL_IDENTITIES_KIND,
  NIP39_IDENTITY_TAG,
  NIP39_KNOWN_PLATFORMS,
  normalizeNip39IdentityName,
  normalizeNip39PlatformName,
  parseNip39ExternalIdentitiesEvent,
  parseNip39ExternalIdentityTag,
  parseNip39ExternalIdentityTags,
  parseNip39IdentityClaim
} from './index.js';

describe('NIP-39 external identities', () => {
  it('builds replaceable kind:10011 external identity events with i tags', () => {
    expect(
      buildNip39ExternalIdentitiesEvent({
        identities: [
          {
            platform: ' GitHub ',
            identity: 'semisol',
            proof: ' 9721ce4ee4fceb91c9711ca2a6c9a5ab '
          },
          {
            platform: 'mastodon',
            identity: 'bitcoinhackers.org/@semisol',
            proof: '109775066355589974',
            extra: [' future ']
          }
        ],
        tags: [['client', 'resonote']]
      })
    ).toEqual({
      kind: NIP39_EXTERNAL_IDENTITIES_KIND,
      content: '',
      tags: [
        ['i', 'github:semisol', '9721ce4ee4fceb91c9711ca2a6c9a5ab'],
        ['i', 'mastodon:bitcoinhackers.org/@semisol', '109775066355589974', 'future'],
        ['client', 'resonote']
      ]
    });
  });

  it('builds identity tags and claim values directly', () => {
    expect(buildNip39IdentityClaim('telegram', '1087295469')).toBe('telegram:1087295469');
    expect(
      buildNip39ExternalIdentityTag({
        platform: 'twitter',
        identity: 'semisol_public',
        proof: '1619358434134196225'
      })
    ).toEqual(['i', 'twitter:semisol_public', '1619358434134196225']);
  });

  it('parses identities, known proof URLs, extra parameters, and custom tags', () => {
    expect(
      parseNip39ExternalIdentitiesEvent({
        kind: 10011,
        pubkey: 'author',
        created_at: 123,
        content: 'ignored by NIP-39',
        tags: [
          ['i', 'github:semisol', '9721ce4ee4fceb91c9711ca2a6c9a5ab'],
          ['i', 'twitter:semisol_public', '1619358434134196225'],
          ['i', 'mastodon:bitcoinhackers.org/@semisol', '109775066355589974'],
          ['i', 'telegram:1087295469', 'nostrdirectory/770', 'future'],
          ['client', 'resonote']
        ]
      })
    ).toEqual({
      pubkey: 'author',
      createdAt: 123,
      content: 'ignored by NIP-39',
      identities: [
        {
          platform: 'github',
          identity: 'semisol',
          value: 'github:semisol',
          proof: '9721ce4ee4fceb91c9711ca2a6c9a5ab',
          proofUrl: 'https://gist.github.com/semisol/9721ce4ee4fceb91c9711ca2a6c9a5ab',
          extra: [],
          knownPlatform: true
        },
        {
          platform: 'twitter',
          identity: 'semisol_public',
          value: 'twitter:semisol_public',
          proof: '1619358434134196225',
          proofUrl: 'https://twitter.com/semisol_public/status/1619358434134196225',
          extra: [],
          knownPlatform: true
        },
        {
          platform: 'mastodon',
          identity: 'bitcoinhackers.org/@semisol',
          value: 'mastodon:bitcoinhackers.org/@semisol',
          proof: '109775066355589974',
          proofUrl: 'https://bitcoinhackers.org/@semisol/109775066355589974',
          extra: [],
          knownPlatform: true
        },
        {
          platform: 'telegram',
          identity: '1087295469',
          value: 'telegram:1087295469',
          proof: 'nostrdirectory/770',
          proofUrl: 'https://t.me/nostrdirectory/770',
          extra: ['future'],
          knownPlatform: true
        }
      ],
      customTags: [['client', 'resonote']]
    });
  });

  it('builds relay filters for latest external identity events', () => {
    expect(
      buildNip39ExternalIdentitiesFilter({
        authors: [' pubkey ', 'pubkey', 'other'],
        identityClaims: [
          'github:semisol',
          { platform: 'twitter', identity: 'semisol_public', proof: 'ignored' },
          { platform: 'telegram', identity: '1087295469', value: 'ignored' }
        ],
        limit: 20
      })
    ).toEqual({
      kinds: [10011],
      authors: ['pubkey', 'other'],
      '#i': ['github:semisol', 'twitter:semisol_public', 'telegram:1087295469'],
      limit: 20
    });
  });

  it('exposes provider constants, guards, and normalization helpers', () => {
    expect(NIP39_IDENTITY_TAG).toBe('i');
    expect(NIP39_KNOWN_PLATFORMS).toEqual(['github', 'twitter', 'mastodon', 'telegram']);
    expect(isNip39ExternalIdentitiesEvent({ kind: 10011 })).toBe(true);
    expect(isNip39KnownPlatform('github')).toBe(true);
    expect(isNip39KnownPlatform('custom')).toBe(false);
    expect(isNip39PlatformName('mastodon.social')).toBe(true);
    expect(isNip39PlatformName('bad:platform')).toBe(false);
    expect(normalizeNip39PlatformName('GitHub')).toBe('github');
    expect(normalizeNip39IdentityName('SemiSol')).toBe('semisol');
  });

  it('parses helpers directly and ignores malformed i tags', () => {
    expect(parseNip39IdentityClaim('github:semisol')).toEqual({
      platform: 'github',
      identity: 'semisol',
      value: 'github:semisol'
    });
    expect(parseNip39ExternalIdentityTag(['x', 'github:semisol', 'proof'])).toBeNull();
    expect(parseNip39ExternalIdentityTag(['i', 'github', 'proof'])).toBeNull();
    expect(parseNip39ExternalIdentityTag(['i', 'bad platform:value', 'proof'])).toBeNull();
    expect(parseNip39ExternalIdentityTag(['i', 'github:semisol', ' '])).toBeNull();
    expect(
      parseNip39ExternalIdentityTags([
        ['i', 'github:semisol', 'proof'],
        ['i', ' ', 'proof']
      ])
    ).toHaveLength(1);
    expect(parseNip39ExternalIdentitiesEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip39ExternalIdentitiesEvent({ kind: 10011, content: '', tags: [] })).toBeNull();
  });

  it('builds proof URLs only for known providers', () => {
    expect(
      buildNip39ProofUrl({
        platform: 'custom',
        identity: 'name',
        proof: 'proof'
      })
    ).toBeNull();
  });

  it('rejects empty identities, invalid platforms, invalid claims, and invalid filter limits', () => {
    expect(() =>
      buildNip39ExternalIdentitiesEvent({
        identities: []
      })
    ).toThrow('NIP-39 external identities event requires at least one identity');
    expect(() => buildNip39IdentityClaim('bad:platform', 'name')).toThrow(
      'NIP-39 platform name must match'
    );
    expect(() => buildNip39IdentityClaim('github', ' ')).toThrow(
      'NIP-39 identity must not be empty'
    );
    expect(() =>
      buildNip39ExternalIdentityTag({ platform: 'github', identity: 'name', proof: '' })
    ).toThrow('NIP-39 proof must not be empty');
    expect(() => buildNip39ExternalIdentitiesFilter({ identityClaims: ['github'] })).toThrow(
      'NIP-39 identity claim must be platform:identity'
    );
    expect(() => buildNip39ExternalIdentitiesFilter({ limit: 0 })).toThrow(
      'NIP-39 filter limit must be a positive safe integer'
    );
  });
});
