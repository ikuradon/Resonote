// @public — Stable API for route/component/feature consumers
/**
 * Player bridge — re-exports player state and actions for feature access.
 */

export {
  getPlayer,
  requestSeek,
  resetPlayer,
  setContent,
  updatePlayback
} from './player.svelte.js';
