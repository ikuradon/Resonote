/**
 * Locale registry — single source of truth for available locales.
 *
 * To add a new language:
 * 1. Create the JSON file (e.g., `ko.json`) with all keys from `en.json`
 * 2. Add an entry to `LOCALES` below
 * 3. Add a static import + compile-time check in `t.ts`
 */

export interface LocaleInfo {
  /** BCP 47 language code */
  code: string;
  /** Label shown in the language switcher */
  label: string;
  /** Flag emoji for visual identification */
  flag: string;
  /** navigator.language prefix to match for auto-detection */
  prefix: string;
}

export const LOCALES = [
  { code: 'en', label: 'English', flag: '🇺🇸', prefix: 'en' },
  { code: 'ja', label: '日本語', flag: '🇯🇵', prefix: 'ja' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', prefix: 'de' },
  { code: 'es', label: 'Español', flag: '🇪🇸', prefix: 'es' },
  { code: 'zh_cn', label: '简体中文', flag: '🇨🇳', prefix: 'zh-cn' },
  { code: 'pt_br', label: 'Português', flag: '🇧🇷', prefix: 'pt-br' },
  { code: 'ko', label: '한국어', flag: '🇰🇷', prefix: 'ko' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', prefix: 'fr' },
  { code: 'ja_osaka', label: '大阪弁', flag: '🏯', prefix: '' }
] as const satisfies readonly LocaleInfo[];

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

/** Check if a string is a valid locale code */
export function isLocale(s: string): s is Locale {
  return LOCALES.some((l) => l.code === s);
}

/** Detect locale from navigator.language, matching against registered prefixes */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const lang = navigator.language.toLowerCase();
  for (const l of LOCALES) {
    if (l.prefix && (lang === l.prefix || lang.startsWith(`${l.prefix}-`))) return l.code;
  }
  return DEFAULT_LOCALE;
}
