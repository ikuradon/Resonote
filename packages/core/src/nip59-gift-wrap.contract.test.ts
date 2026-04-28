import { describe, expect, it } from 'vitest';

import {
  buildNip59GiftWrap,
  buildNip59Rumor,
  type EventSigner,
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  isNip59GiftWrapEvent,
  isNip59SealEvent,
  NIP59_GIFT_WRAP_KIND,
  NIP59_RANDOM_TIMESTAMP_WINDOW_SECONDS,
  NIP59_SEAL_KIND,
  parseNip59RumorJson,
  parseNip59SealJson,
  randomizeNip59Timestamp,
  type UnsignedEvent
} from './index.js';

const authorSecret = new Uint8Array(32).fill(1);
const wrapperSecret = new Uint8Array(32).fill(2);
const authorPubkey = getPublicKey(authorSecret);
const recipientPubkey = getPublicKey(new Uint8Array(32).fill(3));

function signer(): EventSigner {
  return {
    getPublicKey: () => authorPubkey,
    signEvent: (event: UnsignedEvent) => finalizeEvent(event, authorSecret)
  };
}

describe('NIP-59 gift wrap model', () => {
  it('builds an unsigned rumor with canonical event id and no signature', () => {
    const rumor = buildNip59Rumor(
      {
        kind: 14,
        created_at: 1_700_000_000,
        tags: [['p', recipientPubkey]],
        content: 'hello'
      },
      authorPubkey
    );

    expect(rumor).toEqual({
      kind: 14,
      created_at: 1_700_000_000,
      tags: [['p', recipientPubkey]],
      content: 'hello',
      pubkey: authorPubkey,
      id: getEventHash({
        kind: 14,
        created_at: 1_700_000_000,
        tags: [['p', recipientPubkey]],
        content: 'hello',
        pubkey: authorPubkey
      })
    });
    expect('sig' in rumor).toBe(false);
  });

  it('seals a rumor as kind:13 and wraps the seal as kind:1059 with recipient routing', async () => {
    const encryptedPayloads: string[] = [];
    const result = await buildNip59GiftWrap({
      rumor: {
        kind: 14,
        created_at: 1_700_000_000,
        tags: [['p', recipientPubkey]],
        content: 'hello'
      },
      recipientPubkey,
      signer: signer(),
      crypto: {
        encryptSeal: (plaintext, recipient) => {
          encryptedPayloads.push(plaintext);
          return `seal:${recipient}:${plaintext}`;
        },
        encryptWrap: (plaintext, secretKey, recipient) => {
          encryptedPayloads.push(plaintext);
          return `wrap:${getPublicKey(secretKey)}:${recipient}:${plaintext}`;
        }
      },
      now: () => 1_700_010_000,
      random: () => 0.5,
      generateEphemeralSecretKey: () => wrapperSecret
    });

    expect(result.seal).toMatchObject({
      kind: NIP59_SEAL_KIND,
      tags: [],
      pubkey: authorPubkey,
      created_at: 1_699_923_600
    });
    expect(isNip59SealEvent(result.seal)).toBe(true);
    expect(result.giftWrap).toMatchObject({
      kind: NIP59_GIFT_WRAP_KIND,
      pubkey: getPublicKey(wrapperSecret),
      tags: [['p', recipientPubkey]],
      created_at: 1_699_923_600
    });
    expect(isNip59GiftWrapEvent(result.giftWrap, recipientPubkey)).toBe(true);
    expect(result.ephemeralPubkey).toBe(getPublicKey(wrapperSecret));
    expect(parseNip59RumorJson(encryptedPayloads[0])).toEqual(result.rumor);
    expect(parseNip59SealJson(encryptedPayloads[1])).toEqual(result.seal);
  });

  it('preserves caller supplied gift wrap tags while ensuring recipient p-tag exists', async () => {
    const result = await buildNip59GiftWrap({
      rumor: { kind: 1, created_at: 10, tags: [], content: 'note' },
      recipientPubkey,
      signer: signer(),
      crypto: {
        encryptSeal: () => 'seal',
        encryptWrap: () => 'wrap'
      },
      wrapTags: [['expiration', '1700010000']],
      now: () => 20,
      random: () => 0,
      generateEphemeralSecretKey: () => wrapperSecret
    });

    expect(result.giftWrap.tags).toEqual([
      ['p', recipientPubkey],
      ['expiration', '1700010000']
    ]);
  });

  it('rejects signed or tampered rumor payloads', () => {
    const rumor = buildNip59Rumor(
      { kind: 1, created_at: 10, tags: [], content: 'rumor' },
      authorPubkey
    );

    expect(parseNip59RumorJson(JSON.stringify({ ...rumor, sig: 'sig' }))).toBeNull();
    expect(parseNip59RumorJson(JSON.stringify({ ...rumor, content: 'tampered' }))).toBeNull();
    expect(parseNip59RumorJson('not-json')).toBeNull();
  });

  it('rejects malformed seal payloads and signer pubkey mismatches', async () => {
    expect(
      parseNip59SealJson(
        JSON.stringify({
          ...finalizeEvent(
            { kind: NIP59_SEAL_KIND, created_at: 10, tags: [['p', 'x']], content: '' },
            authorSecret
          )
        })
      )
    ).toBeNull();

    await expect(
      buildNip59GiftWrap({
        rumor: { kind: 1, created_at: 10, tags: [], content: 'note' },
        recipientPubkey,
        signer: {
          getPublicKey: () => authorPubkey,
          signEvent: (event) => finalizeEvent(event, generateSecretKey())
        },
        crypto: {
          encryptSeal: () => 'seal',
          encryptWrap: () => 'wrap'
        },
        generateEphemeralSecretKey: () => wrapperSecret
      })
    ).rejects.toThrow('NIP-59 seal signer pubkey mismatch');
  });

  it('randomizes timestamps up to two days in the past', () => {
    expect(
      randomizeNip59Timestamp(
        () => 1_000,
        () => 0
      )
    ).toBe(1_000);
    expect(
      randomizeNip59Timestamp(
        () => 1_000,
        () => 0.5
      )
    ).toBe(1_000 - NIP59_RANDOM_TIMESTAMP_WINDOW_SECONDS / 2);
    expect(
      randomizeNip59Timestamp(
        () => 1_000,
        () => 2
      )
    ).toBe(1_000 - Math.floor(0.999_999 * NIP59_RANDOM_TIMESTAMP_WINDOW_SECONDS));
  });
});
