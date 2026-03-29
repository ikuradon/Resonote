// @public — Stable API for route/component/feature consumers
/**
 * Mute state bridge — re-exports for route/component/feature access.
 */
export type { EncryptionScheme } from './mute.svelte.js';
export {
  clearMuteList,
  getMuteList,
  hasEncryptionSupport,
  hasNip04Support,
  hasNip44Support,
  isMuted,
  isWordMuted,
  loadMuteList,
  muteUser,
  muteWord,
  unmuteUser,
  unmuteWord
} from './mute.svelte.js';
