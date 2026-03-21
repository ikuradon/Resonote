// @public — Stable API for route/component/feature consumers
/**
 * Cached Nostr query bridge — re-exports for route/component access.
 */

export {
  cachedFetchById,
  invalidateFetchByIdCache,
  useCachedLatest,
  type FetchedEventFull,
  type UseCachedLatestResult
} from './cached-query.svelte.js';
