// @internal — Bootstrap helper, not a public API. Use specific bridges instead.
/**
 * Store bridges for bootstrap — re-exports for app layer access.
 * These allow init-session to call store functions without importing $lib directly.
 */

// Follows
export { loadFollows, clearFollows, getFollows } from './follows.svelte.js';

// Bookmarks
export { loadBookmarks, clearBookmarks } from './bookmarks.svelte.js';

// Mute
export { loadMuteList, clearMuteList } from './mute.svelte.js';

// Emoji sets
export { loadCustomEmojis, clearCustomEmojis } from './emoji-sets.svelte.js';

// Profile
export { clearProfiles } from './profile.svelte.js';

// Relays
export { refreshRelayList } from './relays.svelte.js';
