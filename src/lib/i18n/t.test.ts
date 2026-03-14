import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../stores/locale.svelte.js';
import { t } from './t.js';

beforeEach(() => {
  setLocale('en');
});

describe('t()', () => {
  it('should return English translation by default', () => {
    expect(t('login.button')).toBe('Login with Nostr');
  });

  it('should return Japanese translation when locale is ja', () => {
    setLocale('ja');
    expect(t('login.button')).toBe('Nostrでログイン');
  });

  it('should interpolate params', () => {
    expect(t('show.episodes', { name: 'Spotify' })).toBe('View all episodes on Spotify');
  });

  it('should interpolate params in Japanese', () => {
    setLocale('ja');
    expect(t('show.episodes', { name: 'Spotify' })).toBe('Spotifyの全エピソードを見る');
  });

  it('should return key string as last resort', () => {
    expect(t('nonexistent.key' as never)).toBe('nonexistent.key');
  });
});
