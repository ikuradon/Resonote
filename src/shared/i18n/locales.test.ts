import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, detectBrowserLocale, isLocale, LOCALES } from './locales.js';

describe('locales', () => {
  // --- LOCALES constant ---

  describe('LOCALES', () => {
    it('contains all expected locale entries', () => {
      const codes = LOCALES.map((l) => l.code);

      expect(codes).toContain('en');
      expect(codes).toContain('ja');
      expect(codes).toContain('de');
      expect(codes).toContain('es');
      expect(codes).toContain('zh_cn');
      expect(codes).toContain('pt_br');
      expect(codes).toContain('ko');
      expect(codes).toContain('fr');
      expect(codes).toContain('ja_osaka');
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

    it('returns true for "fr"', () => {
      expect(isLocale('fr')).toBe(true);
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

    it('returns "fr" for fr-FR browser language', () => {
      stubLanguage('fr-FR');
      expect(detectBrowserLocale()).toBe('fr');
    });

    it('returns "zh_cn" for zh-CN browser language', () => {
      stubLanguage('zh-CN');
      expect(detectBrowserLocale()).toBe('zh_cn');
    });

    it('returns "de" for de-DE browser language', () => {
      stubLanguage('de-DE');
      expect(detectBrowserLocale()).toBe('de');
    });

    it('returns "ko" for ko-KR browser language', () => {
      stubLanguage('ko-KR');
      expect(detectBrowserLocale()).toBe('ko');
    });

    it('returns "pt_br" for pt-BR browser language', () => {
      stubLanguage('pt-BR');
      expect(detectBrowserLocale()).toBe('pt_br');
    });

    it('returns "es" for es-ES browser language', () => {
      stubLanguage('es-ES');
      expect(detectBrowserLocale()).toBe('es');
    });

    it('returns "en" (default) for unsupported locale "ar"', () => {
      stubLanguage('ar');
      expect(detectBrowserLocale()).toBe('en');
    });
  });
});
