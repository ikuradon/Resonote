import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, isLocale, detectBrowserLocale } from './locales.js';

describe('locales', () => {
  // --- LOCALES constant ---

  describe('LOCALES', () => {
    it('contains en and ja entries', () => {
      const codes = LOCALES.map((l) => l.code);

      expect(codes).toContain('en');
      expect(codes).toContain('ja');
    });

    it('has unique codes', () => {
      const codes = LOCALES.map((l) => l.code);

      expect(new Set(codes).size).toBe(codes.length);
    });
  });

  // --- DEFAULT_LOCALE ---

  describe('DEFAULT_LOCALE', () => {
    it('is "en"', () => {
      expect(DEFAULT_LOCALE).toBe('en');
    });
  });

  // --- isLocale ---

  describe('isLocale', () => {
    it('returns true for "en"', () => {
      expect(isLocale('en')).toBe(true);
    });

    it('returns true for "ja"', () => {
      expect(isLocale('ja')).toBe(true);
    });

    it('returns false for unknown locale "fr"', () => {
      expect(isLocale('fr')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isLocale('')).toBe(false);
    });

    it('returns false for partial match "e"', () => {
      expect(isLocale('e')).toBe(false);
    });

    it('returns false for "EN" (case sensitive)', () => {
      expect(isLocale('EN')).toBe(false);
    });
  });

  // --- detectBrowserLocale ---

  describe('detectBrowserLocale', () => {
    const originalLanguage = navigator.language;

    afterEach(() => {
      vi.unstubAllGlobals();
      // Restore navigator.language set via Object.defineProperty
      Object.defineProperty(navigator, 'language', {
        value: originalLanguage,
        configurable: true
      });
    });

    function stubLanguage(lang: string) {
      Object.defineProperty(navigator, 'language', {
        value: lang,
        configurable: true
      });
    }

    it('returns default locale when navigator is undefined', () => {
      vi.stubGlobal('navigator', undefined);
      expect(detectBrowserLocale()).toBe('en');
    });

    it('returns "ja" for ja-JP browser language', () => {
      stubLanguage('ja-JP');
      expect(detectBrowserLocale()).toBe('ja');
    });

    it('returns "ja" for bare "ja" browser language', () => {
      stubLanguage('ja');
      expect(detectBrowserLocale()).toBe('ja');
    });

    it('returns "en" for en-US browser language', () => {
      stubLanguage('en-US');
      expect(detectBrowserLocale()).toBe('en');
    });

    it('returns "en" for en-GB browser language', () => {
      stubLanguage('en-GB');
      expect(detectBrowserLocale()).toBe('en');
    });

    it('returns "en" (default) for unsupported locale "fr-FR"', () => {
      stubLanguage('fr-FR');
      expect(detectBrowserLocale()).toBe('en');
    });

    it('returns "en" (default) for unsupported locale "zh-CN"', () => {
      stubLanguage('zh-CN');
      expect(detectBrowserLocale()).toBe('en');
    });
  });
});
