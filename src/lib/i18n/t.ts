import en from './en.json';
import ja from './ja.json';
import { getLocale } from '../stores/locale.svelte.js';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

/** Type-safe translation key derived from en.json (source of truth) */
export type TranslationKey = keyof typeof en;

// Compile-time check: every locale JSON must have all keys from en.json.
// To add a new locale: import it, add a check line, and add to `messages`.
const _jaComplete: Record<TranslationKey, string> = ja;
void _jaComplete;

const messages: Record<Locale, Record<string, string>> = { en, ja };

/**
 * Translate a key to the current locale.
 * Supports parameter interpolation: t('key', { name: 'value' })
 * Fallback: current locale → English → key string.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = getLocale();
  let msg = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}
