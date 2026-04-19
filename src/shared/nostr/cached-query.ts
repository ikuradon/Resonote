/**
 * @deprecated Use \`$shared/auftakt/resonote.js\` or feature/application facades instead.
 *
 * RETIREMENT POLICY:
 * This file will be removed once all external consumers are migrated.
 * It currently has zero importers and is kept only for structural parity.
 */
export {
  cachedFetchById,
  type CachedFetchByIdResult,
  type FetchedEventFull,
  invalidateFetchByIdCache,
  resetFetchByIdCache,
  type SettledReadResult,
  useCachedLatest,
  type UseCachedLatestResult
} from './cached-query.svelte.js';
