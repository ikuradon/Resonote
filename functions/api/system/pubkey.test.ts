import { describe, it, expect } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

describe('system/pubkey logic', () => {
  it('should derive correct pubkey from private key hex', () => {
    // Known test vector: secp256k1 generator point
    const privkeyHex = '0000000000000000000000000000000000000000000000000000000000000001';
    const privkey = hexToBytes(privkeyHex);
    const pubkey = getPublicKey(privkey);
    expect(pubkey).toBe('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  });

  it('should return 64-char hex string', () => {
    const privkeyHex = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const privkey = hexToBytes(privkeyHex);
    const pubkey = getPublicKey(privkey);
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
  });
});
