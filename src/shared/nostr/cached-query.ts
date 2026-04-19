/**
 * @deprecated Use \`$shared/auftakt/resonote.js\` or feature/application facades instead.
 *
 * RETIREMENT POLICY:
 * This file will be removed once all external consumers are migrated.
 * Production callers were moved to `cached-query.svelte.ts`; this alias remains for
 * transitional compatibility only.
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
