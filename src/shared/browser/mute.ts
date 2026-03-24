// @public — Stable API for route/component/feature consumers
/**
 * Mute state bridge — re-exports for route/component/feature access.
 */
export {
  clearMuteList,
  getMuteList,
  hasNip44Support,
  isMuted,
  isWordMuted,
  loadMuteList,
  muteUser,
  muteWord,
  unmuteUser,
  unmuteWord
} from './mute.svelte.js';
