import { beforeEach, describe, expect, it } from 'vitest';

import { getLocale, setLocale } from './locale.js';

describe('locale store', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('should default to en in test environment', () => {
    expect(getLocale()).toBe('en');
  });

  it('should update locale with setLocale', () => {
    setLocale('ja');
    expect(getLocale()).toBe('ja');
    setLocale('en');
    expect(getLocale()).toBe('en');
  });
});
