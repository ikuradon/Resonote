import type { TranslationKey } from '$shared/i18n/t.js';

const FEED_WARNING_KEY_BY_CODE: Record<string, TranslationKey | undefined> = {
  listen_episode_not_found: 'podcast.warning.listen_episode_not_found'
};

export function getFeedWarningKey(code: string | null): TranslationKey | null {
  if (!code) return null;
  if (!Object.hasOwn(FEED_WARNING_KEY_BY_CODE, code)) return null;
  return FEED_WARNING_KEY_BY_CODE[code] ?? null;
}
