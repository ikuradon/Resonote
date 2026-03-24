// @internal — Bootstrap helper, not a public API. Use specific bridges instead.
/**
 * Store bridges for bootstrap — re-exports for app layer access.
 * These allow init-session to call store functions without importing $lib directly.
 */

// Follows
export { clearFollows, getFollows, loadFollows } from './follows.svelte.js';

// Bookmarks
export { clearBookmarks, loadBookmarks } from './bookmarks.svelte.js';

// Mute
export { clearMuteList, loadMuteList } from './mute.svelte.js';

// Emoji sets
export { clearCustomEmojis, loadCustomEmojis } from './emoji-sets.svelte.js';

// Profile
export { clearProfiles } from './profile.svelte.js';

// Relays
export { refreshRelayList } from './relays.svelte.js';
