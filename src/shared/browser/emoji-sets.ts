// @public — Stable API for route/component/feature consumers
/**
 * Custom emoji state bridge — re-exports for component/app access.
 */

export {
  clearCustomEmojis,
  getCustomEmojis,
  loadCustomEmojis,
  setCustomEmojis
} from './emoji-sets.svelte.js';
export type { EmojiCategory } from '$shared/auftakt/resonote.js';
