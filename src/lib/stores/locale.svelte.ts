export type Locale = 'en' | 'ja';

let current = $state<Locale>(detectLocale());

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem('resonote-locale');
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    // localStorage not available (Safari private mode, etc.)
  }

  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  return lang.startsWith('ja') ? 'ja' : 'en';
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
