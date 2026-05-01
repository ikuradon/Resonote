import { describe, expect, it } from 'vitest';

import {
  buildNip40ExpirationTag,
  hasNip40Expiration,
  isNip40Expired,
  NIP40_EXPIRATION_TAG,
  parseNip40Expiration
} from './index.js';

describe('NIP-40 expiration timestamps', () => {
  it('builds and parses expiration tags', () => {
    expect(buildNip40ExpirationTag(1700010000)).toEqual([NIP40_EXPIRATION_TAG, '1700010000']);
    expect(parseNip40Expiration({ tags: [['expiration', '1700010000']] })).toBe(1700010000);
    expect(parseNip40Expiration({ tags: [['expiration', ' 1700010000 ']] })).toBe(1700010000);
  });

  it('rejects malformed expiration tag values', () => {
    for (const value of ['', ' ', 'soon', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1)]) {
      expect(parseNip40Expiration({ tags: [['expiration', value]] })).toBeNull();
    }
    expect(() => buildNip40ExpirationTag(-1)).toThrow(
      'NIP-40 expiration timestamp must be a non-negative safe integer'
    );
    expect(() => buildNip40ExpirationTag(1.5)).toThrow(
      'NIP-40 expiration timestamp must be a non-negative safe integer'
    );
  });

  it('treats events as expired when the timestamp has been reached', () => {
    expect(hasNip40Expiration({ tags: [] })).toBe(false);
    expect(hasNip40Expiration({ tags: [['expiration', '10']] })).toBe(true);

    expect(isNip40Expired({ tags: [] }, 10)).toBe(false);
    expect(isNip40Expired({ tags: [['expiration', '11']] }, 10)).toBe(false);
    expect(isNip40Expired({ tags: [['expiration', '10']] }, 10)).toBe(true);
    expect(isNip40Expired({ tags: [['expiration', '9']] }, 10)).toBe(true);
  });
});
