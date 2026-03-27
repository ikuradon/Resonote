import { getLocale } from '$shared/browser/locale.js';

import de from './de.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import ja from './ja.json';
import ja_osaka from './ja_osaka.json';
import ja_villainess from './ja_villainess.json';
import ko from './ko.json';
import { DEFAULT_LOCALE, type Locale } from './locales.js';
import pt_br from './pt_br.json';
import zh_cn from './zh_cn.json';

export type { Locale } from './locales.js';
export type { LocaleInfo } from './locales.js';
export { detectBrowserLocale, isLocale, LOCALES } from './locales.js';

export type TranslationKey = keyof typeof en;

const _jaComplete: Record<TranslationKey, string> = ja;
const _deComplete: Record<TranslationKey, string> = de;
const _esComplete: Record<TranslationKey, string> = es;
const _zhCnComplete: Record<TranslationKey, string> = zh_cn;
const _ptBrComplete: Record<TranslationKey, string> = pt_br;
const _koComplete: Record<TranslationKey, string> = ko;
const _frComplete: Record<TranslationKey, string> = fr;
const _jaOsakaComplete: Record<TranslationKey, string> = ja_osaka;
const _jaVillainessComplete: Record<TranslationKey, string> = ja_villainess;
void _jaComplete;
void _deComplete;
void _esComplete;
void _zhCnComplete;
void _ptBrComplete;
void _koComplete;
void _frComplete;
void _jaOsakaComplete;
void _jaVillainessComplete;

const messages: Record<Locale, Partial<Record<string, string>>> = {
  en,
  ja,
  de,
  es,
  zh_cn,
  pt_br,
  ko,
  fr,
  ja_osaka,
  ja_villainess
};

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
