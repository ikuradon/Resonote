import { describe, expect, it } from 'vitest';

import type { EventSigner, UnsignedEvent } from './index.js';
import {
  buildNip37DraftDeletionEvent,
  buildNip37DraftWrapEvent,
  buildNip37PrivateRelayListEvent,
  encryptNip37DraftWrap,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  NIP37_DRAFT_WRAP_KIND,
  NIP37_PRIVATE_RELAY_LIST_KIND,
  parseNip37DraftWrapEvent,
  parseNip37PrivateRelayListEvent,
  parseNip37PrivateRelayTags,
  parseNip37PrivateRelayTagsJson,
  stringifyNip37PrivateRelayTags
} from './index.js';

function createSigner(): EventSigner {
  const secretKey = generateSecretKey();
  return {
    getPublicKey: () => getPublicKey(secretKey),
    signEvent: (event: UnsignedEvent) => finalizeEvent(event, secretKey)
  };
}

describe('NIP-37 draft wraps', () => {
  it('encrypts unsigned drafts to the signer pubkey and builds kind:31234 wrappers', async () => {
    const signer = createSigner();
    const encrypted = await encryptNip37DraftWrap({
      signer,
      crypto: {
        encryptDraft: (plaintext, recipient) => `encrypted:${recipient}:${plaintext}`
      },
      draft: {
        kind: 1,
        content: 'draft text',
        created_at: 100,
        tags: [['t', 'nostr']]
      },
      identifier: ' reply-draft ',
      expiration: 1000,
      createdAt: 120,
      tags: [
        ['client', 'Resonote'],
        ['k', 'ignored']
      ]
    });

    expect(encrypted).toEqual({
      kind: NIP37_DRAFT_WRAP_KIND,
      created_at: 120,
      content: `encrypted:${await signer.getPublicKey()}:{"kind":1,"content":"draft text","created_at":100,"tags":[["t","nostr"]]}`,
      tags: [
        ['d', 'reply-draft'],
        ['k', '1'],
        ['expiration', '1000'],
        ['client', 'Resonote']
      ]
    });
  });

  it('parses draft wrappers and blank-content deletion markers', () => {
    expect(
      parseNip37DraftWrapEvent({
        kind: NIP37_DRAFT_WRAP_KIND,
        pubkey: 'author',
        created_at: 120,
        content: 'ciphertext',
        tags: [
          ['d', 'reply-draft'],
          ['k', '1111'],
          ['expiration', '1000'],
          ['client', 'Resonote']
        ]
      })
    ).toEqual({
      identifier: 'reply-draft',
      draftKind: 1111,
      encryptedContent: 'ciphertext',
      deleted: false,
      expiration: 1000,
      pubkey: 'author',
      createdAt: 120,
      tags: [
        ['d', 'reply-draft'],
        ['k', '1111'],
        ['expiration', '1000'],
        ['client', 'Resonote']
      ],
      customTags: [['client', 'Resonote']]
    });

    expect(
      parseNip37DraftWrapEvent(
        buildNip37DraftDeletionEvent({ draftKind: 1, identifier: 'reply-draft' })
      )
    ).toMatchObject({
      identifier: 'reply-draft',
      draftKind: 1,
      encryptedContent: null,
      deleted: true
    });
    expect(
      parseNip37DraftWrapEvent({ kind: NIP37_DRAFT_WRAP_KIND, content: '', tags: [] })
    ).toBeNull();
  });

  it('builds explicit encrypted draft wrappers', () => {
    expect(
      buildNip37DraftWrapEvent({
        draft: { kind: 30023, content: '', created_at: 100, tags: [] },
        encryptedContent: 'ciphertext'
      })
    ).toEqual({
      kind: NIP37_DRAFT_WRAP_KIND,
      created_at: undefined,
      content: 'ciphertext',
      tags: [
        ['d', ''],
        ['k', '30023']
      ]
    });
  });

  it('handles private relay list events and decrypted relay tags', () => {
    expect(
      buildNip37PrivateRelayListEvent({
        encryptedContent: 'encrypted-relay-tags',
        createdAt: 200
      })
    ).toEqual({
      kind: NIP37_PRIVATE_RELAY_LIST_KIND,
      created_at: 200,
      content: 'encrypted-relay-tags',
      tags: []
    });

    expect(
      parseNip37PrivateRelayListEvent({
        kind: NIP37_PRIVATE_RELAY_LIST_KIND,
        pubkey: 'author',
        created_at: 200,
        content: 'encrypted-relay-tags'
      })
    ).toEqual({
      encryptedContent: 'encrypted-relay-tags',
      pubkey: 'author',
      createdAt: 200
    });

    const plaintext = stringifyNip37PrivateRelayTags([
      'wss://relay.example/path?ignored=1',
      'wss://relay.example/path#fragment',
      'https://not-a-relay.example'
    ]);
    expect(plaintext).toBe('[["relay","wss://relay.example/path"]]');
    expect(parseNip37PrivateRelayTagsJson(plaintext)).toEqual(['wss://relay.example/path']);
    expect(
      parseNip37PrivateRelayTags([
        ['relay', 'ws://relay.example'],
        ['r', 'wss://ignored.example']
      ])
    ).toEqual(['ws://relay.example/']);
  });
});
