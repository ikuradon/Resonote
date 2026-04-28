import { describe, expect, it } from 'vitest';

import {
  buildNip17ChatMessage,
  buildNip17ConversationGiftWraps,
  buildNip17DmRelayList,
  buildNip17FileMessage,
  conversationParticipants,
  type EventSigner,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  isNip17Rumor,
  NIP17_CHAT_MESSAGE_KIND,
  NIP17_DM_RELAY_LIST_KIND,
  NIP17_FILE_MESSAGE_KIND,
  nip17ConversationKey,
  parseNip17DmRelayListTags,
  parseNip59RumorJson,
  parseNip59SealJson,
  type UnsignedEvent
} from './index.js';

const senderSecret = new Uint8Array(32).fill(7);
const senderPubkey = getPublicKey(senderSecret);
const alicePubkey = getPublicKey(new Uint8Array(32).fill(8));
const bobPubkey = getPublicKey(new Uint8Array(32).fill(9));

function signer(): EventSigner {
  return {
    getPublicKey: () => senderPubkey,
    signEvent: (event: UnsignedEvent) => finalizeEvent(event, senderSecret)
  };
}

describe('NIP-17 private direct messages', () => {
  it('builds unsigned kind:14 chat message rumors with recipient p-tags', () => {
    const rumor = buildNip17ChatMessage({
      senderPubkey,
      recipientPubkeys: [alicePubkey, alicePubkey, bobPubkey],
      content: 'hello private room',
      createdAt: 1_700_000_000,
      replyTo: { id: 'reply-id', relayHint: 'wss://relay.example' },
      subject: 'room topic',
      tags: [['q', 'quoted-event']]
    });

    expect(rumor).toMatchObject({
      kind: NIP17_CHAT_MESSAGE_KIND,
      pubkey: senderPubkey,
      created_at: 1_700_000_000,
      content: 'hello private room',
      tags: [
        ['p', alicePubkey],
        ['p', bobPubkey],
        ['e', 'reply-id', 'wss://relay.example', 'reply'],
        ['subject', 'room topic'],
        ['q', 'quoted-event']
      ]
    });
    expect('sig' in rumor).toBe(false);
    expect(isNip17Rumor(rumor)).toBe(true);
    expect(conversationParticipants(rumor)).toEqual([senderPubkey, alicePubkey, bobPubkey]);
    expect(nip17ConversationKey(rumor)).toBe(
      [senderPubkey, alicePubkey, bobPubkey].sort().join(':')
    );
  });

  it('builds kind:15 file message rumors with required encrypted file metadata', () => {
    expect(
      buildNip17FileMessage({
        senderPubkey,
        recipientPubkeys: [alicePubkey],
        content: 'https://cdn.example/encrypted-file',
        createdAt: 1_700_000_100,
        fileType: 'image/jpeg',
        encryptionAlgorithm: 'aes-gcm',
        decryptionKey: 'key',
        decryptionNonce: 'nonce',
        encryptedSha256: 'encrypted-hash',
        originalSha256: 'plain-hash',
        size: 42,
        dimensions: '10x10',
        fallbackUrls: ['https://fallback.example/file']
      })
    ).toMatchObject({
      kind: NIP17_FILE_MESSAGE_KIND,
      tags: expect.arrayContaining([
        ['file-type', 'image/jpeg'],
        ['encryption-algorithm', 'aes-gcm'],
        ['decryption-key', 'key'],
        ['decryption-nonce', 'nonce'],
        ['x', 'encrypted-hash'],
        ['ox', 'plain-hash'],
        ['size', '42'],
        ['dim', '10x10'],
        ['fallback', 'https://fallback.example/file']
      ])
    });
  });

  it('gift-wraps one encrypted chat message to every recipient and the sender', async () => {
    const wrapperSecrets = [
      new Uint8Array(32).fill(10),
      new Uint8Array(32).fill(11),
      new Uint8Array(32).fill(12)
    ];
    const encryptedSealRecipients: string[] = [];
    const encryptedWrapRecipients: string[] = [];

    const result = await buildNip17ConversationGiftWraps({
      message: {
        kind: NIP17_CHAT_MESSAGE_KIND,
        created_at: 1_700_000_000,
        tags: [
          ['p', alicePubkey],
          ['p', bobPubkey]
        ],
        content: 'hello'
      },
      recipientPubkeys: [alicePubkey, bobPubkey],
      signer: signer(),
      crypto: {
        encryptSeal: (plaintext, recipient) => {
          encryptedSealRecipients.push(recipient);
          expect(parseNip59RumorJson(plaintext)).toMatchObject({
            kind: NIP17_CHAT_MESSAGE_KIND,
            pubkey: senderPubkey
          });
          return `seal:${recipient}`;
        },
        encryptWrap: (plaintext, secretKey, recipient) => {
          encryptedWrapRecipients.push(recipient);
          expect(parseNip59SealJson(plaintext)).toMatchObject({
            kind: 13,
            pubkey: senderPubkey,
            content: `seal:${recipient}`
          });
          return `wrap:${getPublicKey(secretKey)}:${recipient}`;
        }
      },
      now: () => 1_700_000_500,
      random: () => 0,
      generateEphemeralSecretKey: () => wrapperSecrets.shift() ?? generateSecretKey()
    });

    expect(result.rumor).toMatchObject({
      kind: NIP17_CHAT_MESSAGE_KIND,
      pubkey: senderPubkey
    });
    expect(result.wraps.map((wrap) => wrap.recipientPubkey)).toEqual([
      alicePubkey,
      bobPubkey,
      senderPubkey
    ]);
    expect(encryptedSealRecipients).toEqual([alicePubkey, bobPubkey, senderPubkey]);
    expect(encryptedWrapRecipients).toEqual([alicePubkey, bobPubkey, senderPubkey]);
    for (const wrap of result.wraps) {
      expect(wrap.giftWrap).toMatchObject({
        kind: 1059,
        tags: [['p', wrap.recipientPubkey]]
      });
    }
  });

  it('can omit the sender recovery wrap for disappearing-message style use', async () => {
    const result = await buildNip17ConversationGiftWraps({
      message: {
        kind: NIP17_CHAT_MESSAGE_KIND,
        created_at: 1_700_000_000,
        tags: [['p', alicePubkey]],
        content: 'short lived'
      },
      recipientPubkeys: [alicePubkey],
      includeSenderWrap: false,
      signer: signer(),
      crypto: {
        encryptSeal: () => 'seal',
        encryptWrap: () => 'wrap'
      },
      generateEphemeralSecretKey: () => new Uint8Array(32).fill(13)
    });

    expect(result.wraps.map((wrap) => wrap.recipientPubkey)).toEqual([alicePubkey]);
  });

  it('rejects unsupported encrypted chat message kinds', async () => {
    await expect(
      buildNip17ConversationGiftWraps({
        message: { kind: 1, created_at: 1, tags: [], content: 'public note' },
        recipientPubkeys: [alicePubkey],
        signer: signer(),
        crypto: {
          encryptSeal: () => 'seal',
          encryptWrap: () => 'wrap'
        }
      })
    ).rejects.toThrow('NIP-17 encrypted chat messages must use kind:14 or kind:15');
  });

  it('builds and parses kind:10050 DM relay lists', () => {
    expect(
      buildNip17DmRelayList([
        'wss://inbox.example/path?ignored=true',
        'https://not-a-relay.example',
        'wss://inbox.example/path',
        'wss://backup.example'
      ])
    ).toEqual({
      kind: NIP17_DM_RELAY_LIST_KIND,
      content: '',
      tags: [
        ['relay', 'wss://inbox.example/path'],
        ['relay', 'wss://backup.example/']
      ]
    });

    expect(
      parseNip17DmRelayListTags([
        ['relay', 'wss://one.example'],
        ['r', 'wss://wrong-tag.example'],
        ['relay', 'ftp://wrong-protocol.example'],
        ['relay', 'wss://one.example/']
      ])
    ).toEqual(['wss://one.example/']);
  });
});
