// @public — Stable API for route/component/feature consumers
/**
 * Cached Nostr query bridge — re-exports for route/component access.
 */

export {
  cachedFetchById,
  type FetchedEventFull,
  invalidateFetchByIdCache,
  resetFetchByIdCache,
  useCachedLatest,
  type UseCachedLatestResult
} from './cached-query.svelte.js';
