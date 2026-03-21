// @public — Stable API for route/component/feature consumers
/**
 * Mute state bridge — re-exports for route/component/feature access.
 */
export {
  isMuted,
  isWordMuted,
  getMuteList,
  hasNip44Support,
  muteUser,
  unmuteUser,
  muteWord,
  unmuteWord,
  loadMuteList,
  clearMuteList
} from './mute.svelte.js';
