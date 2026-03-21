import { describe, it, expect } from 'vitest';
import {
  describeProfileDisplay,
  truncateProfileName,
  formatDisplayName,
  formatNip05,
  getProfileHref,
  MAX_NAME_LENGTH
} from './profile-model.js';

const TEST_PUBKEY = 'd7e1bd910193e1b04e1db95e7a837a90fcb696bf4e0a716392569fac71da5268';

describe('truncateProfileName', () => {
  it('should return short strings unchanged', () => {
    expect(truncateProfileName('short string')).toBe('short string');
  });

  it('should return strings at the limit unchanged', () => {
    const value = 'a'.repeat(MAX_NAME_LENGTH);
    expect(truncateProfileName(value)).toBe(value);
  });

  it('should truncate strings longer than the limit', () => {
    const value = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(truncateProfileName(value)).toBe('a'.repeat(MAX_NAME_LENGTH) + '…');
  });

  it('should truncate multibyte characters at character boundaries', () => {
    const value = 'あ'.repeat(MAX_NAME_LENGTH + 1);
    expect(truncateProfileName(value)).toBe('あ'.repeat(MAX_NAME_LENGTH) + '…');
  });
});

describe('formatDisplayName', () => {
  it('should prefer displayName over name', () => {
    expect(formatDisplayName(TEST_PUBKEY, { displayName: 'Alice', name: 'alice' })).toBe('Alice');
  });

  it('should use name when displayName is missing', () => {
    expect(formatDisplayName(TEST_PUBKEY, { name: 'alice' })).toBe('alice');
  });

  it('should fall back to truncated npub when profile is empty', () => {
    const result = formatDisplayName(TEST_PUBKEY, {});
    expect(result).toMatch(/^npub1[a-z0-9]{7}\.\.\.([a-z0-9]{4})$/);
  });

  it('should fall back to truncated npub when profile is undefined', () => {
    const result = formatDisplayName(TEST_PUBKEY, undefined);
    expect(result).toMatch(/^npub1[a-z0-9]{7}\.\.\.([a-z0-9]{4})$/);
  });
});

describe('formatNip05', () => {
  it('should return the original value when truncation is disabled', () => {
    expect(formatNip05('alice@example.com')).toBe('alice@example.com');
  });

  it('should truncate long values when requested', () => {
    expect(formatNip05('very.long.identifier@example.com', true)).toBe(
      'very.long.identifi…'
    );
  });
});

describe('getProfileHref', () => {
  it('should build a profile route path from a hex pubkey', () => {
    expect(getProfileHref(TEST_PUBKEY)).toMatch(/^\/profile\/npub1/);
  });
});

describe('describeProfileDisplay', () => {
  it('should include display fields and verified nip05 metadata', () => {
    expect(
      describeProfileDisplay(TEST_PUBKEY, {
        displayName: 'Alice',
        picture: 'https://example.com/alice.png',
        nip05: 'alice@example.com',
        nip05valid: true
      })
    ).toEqual({
      displayName: 'Alice',
      picture: 'https://example.com/alice.png',
      profileHref: expect.stringMatching(/^\/profile\/npub1/),
      nip05: 'alice@example.com',
      formattedNip05: 'alice@example.com'
    });
  });

  it('should omit nip05 display fields when the identifier is not verified', () => {
    expect(
      describeProfileDisplay(TEST_PUBKEY, {
        name: 'alice',
        nip05: 'alice@example.com',
        nip05valid: false
      })
    ).toEqual({
      displayName: 'alice',
      picture: undefined,
      profileHref: expect.stringMatching(/^\/profile\/npub1/),
      nip05: undefined,
      formattedNip05: undefined
    });
  });
});
