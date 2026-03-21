import { type Locale, isLocale, detectBrowserLocale } from '$shared/i18n/locales.js';

export type { Locale };

let current = $state<Locale>(detectLocale());

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem('resonote-locale');
    if (saved && isLocale(saved)) return saved;
  } catch {
    // localStorage not available (Safari private mode, etc.)
  }
  return detectBrowserLocale();
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  try {
    localStorage.setItem('resonote-locale', locale);
  } catch {
    // Ignore storage errors
  }
}
