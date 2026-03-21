// @public — Stable API for route/component/feature consumers
/**
 * Custom emoji state bridge — re-exports for component/app access.
 */

export {
  getCustomEmojis,
  loadCustomEmojis,
  clearCustomEmojis
} from './emoji-sets.svelte.js';
export type { CustomEmoji, EmojiCategory } from './emoji-sets.svelte.js';
