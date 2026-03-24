import { getLocale } from '$shared/browser/locale.js';

import en from './en.json';
import ja from './ja.json';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

export type { Locale } from './locales.js';
export type { LocaleInfo } from './locales.js';
export { detectBrowserLocale, isLocale, LOCALES } from './locales.js';

export type TranslationKey = keyof typeof en;

const _jaComplete: Record<TranslationKey, string> = ja;
void _jaComplete;

const messages: Record<Locale, Partial<Record<string, string>>> = { en, ja };

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const locale = getLocale();
  let msg = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}
