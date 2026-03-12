import { describe, it, expect } from 'vitest';
import { truncate, formatDisplayName, MAX_NAME_LENGTH } from './profile-utils.js';

const TEST_PUBKEY = 'd7e1bd910193e1b04e1db95e7a837a90fcb696bf4e0a716392569fac71da5268';

describe('truncate', () => {
  it('文字数が32未満の文字列はそのまま返す', () => {
    const s = 'short string';
    expect(truncate(s)).toBe(s);
  });

  it('ちょうど32文字の文字列はそのまま返す', () => {
    const s = 'a'.repeat(MAX_NAME_LENGTH);
    expect(truncate(s)).toBe(s);
  });

  it('33文字の文字列は32文字 + … に切り詰める', () => {
    const s = 'a'.repeat(MAX_NAME_LENGTH + 1);
    expect(truncate(s)).toBe('a'.repeat(MAX_NAME_LENGTH) + '…');
  });

  it('空文字列はそのまま返す', () => {
    expect(truncate('')).toBe('');
  });

  it('マルチバイト文字（日本語）は文字境界で正しく切り詰める', () => {
    const s = 'あ'.repeat(MAX_NAME_LENGTH + 1);
    expect(truncate(s)).toBe('あ'.repeat(MAX_NAME_LENGTH) + '…');
  });

  it('ちょうど MAX_NAME_LENGTH+1 文字の文字列を切り詰める', () => {
    const s = 'b'.repeat(MAX_NAME_LENGTH + 1);
    const result = truncate(s);
    expect(result).toBe('b'.repeat(MAX_NAME_LENGTH) + '…');
    expect([...result].length).toBe(MAX_NAME_LENGTH + 1);
  });
});

describe('formatDisplayName', () => {
  it('displayName が設定されている場合はそれを返す', () => {
    const profile = { displayName: 'Alice', name: 'alice' };
    expect(formatDisplayName(TEST_PUBKEY, profile)).toBe('Alice');
  });

  it('name のみ設定されている場合は name を返す', () => {
    const profile = { name: 'alice' };
    expect(formatDisplayName(TEST_PUBKEY, profile)).toBe('alice');
  });

  it('displayName と name の両方がある場合は displayName を優先する', () => {
    const profile = { displayName: 'Alice Display', name: 'alice_name' };
    expect(formatDisplayName(TEST_PUBKEY, profile)).toBe('Alice Display');
  });

  it('どちらも設定されていない場合は npub の短縮形を返す', () => {
    const profile = {};
    const result = formatDisplayName(TEST_PUBKEY, profile);
    expect(result).toMatch(/^npub1[a-z0-9]{7}\.\.\.([a-z0-9]{4})$/);
  });

  it('profile が undefined の場合は npub の短縮形を返す', () => {
    const result = formatDisplayName(TEST_PUBKEY, undefined);
    expect(result).toMatch(/^npub1[a-z0-9]{7}\.\.\.([a-z0-9]{4})$/);
  });

  it('空の profile ({}) の場合は npub の短縮形を返す', () => {
    const result = formatDisplayName(TEST_PUBKEY, {});
    expect(result).toMatch(/^npub1[a-z0-9]{7}\.\.\.([a-z0-9]{4})$/);
  });

  it('npub 短縮形は 12文字...4文字 の形式である', () => {
    const result = formatDisplayName(TEST_PUBKEY, undefined);
    const parts = result.split('...');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBe(12);
    expect(parts[1].length).toBe(4);
  });

  it('すでに … を含む displayName はそのまま返す', () => {
    const profile = { displayName: 'Alice…' };
    expect(formatDisplayName(TEST_PUBKEY, profile)).toBe('Alice…');
  });
});
