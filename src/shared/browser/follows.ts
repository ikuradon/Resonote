// @public — Stable API for route/component/feature consumers
/**
 * Follows state bridge — re-exports for route/component/feature access.
 */
export {
  clearFollows,
  followUser,
  getFollows,
  loadFollows,
  matchesFilter,
  refreshFollows,
  unfollowUser
} from './follows.svelte.js';
export type { FollowFilter } from '$features/follows/domain/follow-model.js';
export { extractFollows } from '$features/follows/domain/follow-model.js';
