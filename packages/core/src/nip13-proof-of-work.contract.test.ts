import {
  buildNip13NonceTag,
  calculateNip13EventDifficulty,
  countNip13LeadingZeroBits,
  hasNip13ProofOfWork,
  NIP13_NONCE_TAG,
  parseNip13Nonce,
  validateNip13ProofOfWork
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

describe('NIP-13 proof-of-work helpers', () => {
  it('builds and parses nonce tags with target difficulty commitments', () => {
    expect(buildNip13NonceTag(776797, 20)).toEqual(['nonce', '776797', '20']);
    expect(parseNip13Nonce({ tags: [['nonce', '776797', '20']] })).toEqual({
      nonce: '776797',
      difficulty: 20
    });
    expect(parseNip13Nonce({ tags: [['nonce', '1', 'not-a-number']] })).toEqual({
      nonce: '1',
      difficulty: null
    });
    expect(parseNip13Nonce({ tags: [] })).toBeNull();
    expect(NIP13_NONCE_TAG).toBe('nonce');
  });

  it('counts leading zero bits in event ids', () => {
    expect(
      countNip13LeadingZeroBits('000000000e9d97a1ab09fc381030b346cdd7a142ad57e6df0b46dc9bef6c7e2d')
    ).toBe(36);
    expect(countNip13LeadingZeroBits('002f')).toBe(10);
    expect(countNip13LeadingZeroBits('7f')).toBe(1);
    expect(() => countNip13LeadingZeroBits('not-hex')).toThrow(
      'NIP-13 hex value must contain only hexadecimal characters'
    );
  });

  it('calculates difficulty from a NIP-01 event id', () => {
    expect(
      calculateNip13EventDifficulty({
        id: '000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358'
      })
    ).toBe(21);
    expect(calculateNip13EventDifficulty({ id: 'short' })).toBeNull();
  });

  it('validates work and committed target difficulty', () => {
    const event = {
      id: '000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358',
      tags: [['nonce', '776797', '20']]
    };

    expect(validateNip13ProofOfWork(event, 20)).toEqual({
      ok: true,
      difficulty: 21,
      claimedDifficulty: 20,
      requiredDifficulty: 20,
      reason: 'valid'
    });
    expect(hasNip13ProofOfWork(event, 20)).toBe(true);
  });

  it('rejects insufficient work or missing commitments', () => {
    expect(
      validateNip13ProofOfWork(
        {
          id: '000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358',
          tags: [['nonce', '776797', '20']]
        },
        22
      )
    ).toMatchObject({
      ok: false,
      difficulty: 21,
      claimedDifficulty: 20,
      reason: 'insufficient-work'
    });
    expect(
      validateNip13ProofOfWork({
        id: '000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358',
        tags: [['nonce', '776797']]
      })
    ).toMatchObject({
      ok: false,
      difficulty: 21,
      claimedDifficulty: null,
      reason: 'insufficient-commitment'
    });
    expect(validateNip13ProofOfWork({ id: 'invalid', tags: [['nonce', '1', '1']] })).toMatchObject({
      ok: false,
      difficulty: 0,
      reason: 'invalid-id'
    });
  });
});
