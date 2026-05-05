import { type EmojiCategory, fetchCustomEmojiCategories } from '$shared/auftakt/resonote.js';
import { createLogger, shortHex } from '$shared/utils/logger.js';

const log = createLogger('emoji-sets');

let customEmojis = $state<EmojiCategory[]>([]);
let loading = $state(false);
let generation = 0;

export function getCustomEmojis() {
  return {
    get categories() {
      return customEmojis;
    },
    get loading() {
      return loading;
    }
  };
}

export async function loadCustomEmojis(pubkey: string): Promise<void> {
  const gen = ++generation;
  loading = true;
  log.info('Loading custom emojis', { pubkey: shortHex(pubkey) });

  try {
    const categories = await fetchCustomEmojiCategories(pubkey);
    if (gen !== generation) return;
    customEmojis = categories;
    log.info('Custom emojis ready', {
      categoryCount: customEmojis.length,
      totalEmojis: customEmojis.reduce((sum, category) => sum + category.emojis.length, 0)
    });
  } catch (err) {
    log.error('Failed to load custom emojis', err);
  } finally {
    if (gen === generation) {
      loading = false;
    }
  }
}

export function clearCustomEmojis(): void {
  log.info('Clearing custom emojis');
  ++generation;
  customEmojis = [];
  loading = false;
}

export function setCustomEmojis(categories: readonly EmojiCategory[]): void {
  log.info('Setting custom emojis from resolved diagnostics', {
    categoryCount: categories.length,
    totalEmojis: categories.reduce((sum, category) => sum + category.emojis.length, 0)
  });
  ++generation;
  customEmojis = categories.map((category) => ({
    ...category,
    emojis: category.emojis.map((emoji) => ({
      ...emoji,
      skins: emoji.skins.map((skin) => ({ ...skin }))
    }))
  }));
  loading = false;
}
