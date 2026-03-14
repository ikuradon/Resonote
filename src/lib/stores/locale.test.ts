import { describe, it, expect } from 'vitest';
import { getLocale, setLocale } from './locale.svelte.js';

describe('locale store', () => {
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
