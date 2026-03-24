/**
 * Lazy-loads emoji-mart data and module with IndexedDB caching.
 *
 * The processed emoji data (with search indices already built) is cached
 * in IndexedDB keyed by package version. On subsequent sessions, the cached
 * data is restored so _init() skips the expensive search-index construction
 * (guarded by `if (!emoji.search)`).
 */

import { openDB } from 'idb';

const CACHE_DB = 'resonote-emoji-cache';
const CACHE_STORE = 'data';
const CACHE_KEY = 'emoji-kitchen-mart@7.0.0+data@2.0.0';

async function getCachedData(): Promise<unknown | null> {
  try {
    const db = await openDB(CACHE_DB, 1, {
      upgrade(db) {
        db.createObjectStore(CACHE_STORE);
      }
    });
    const data = await db.get(CACHE_STORE, CACHE_KEY);
    db.close();
    return data ?? null;
  } catch {
    return null;
  }
}

async function setCachedData(data: unknown): Promise<void> {
  try {
    const db = await openDB(CACHE_DB, 1, {
      upgrade(db) {
        db.createObjectStore(CACHE_STORE);
      }
    });
    await db.clear(CACHE_STORE);
    await db.put(CACHE_STORE, data, CACHE_KEY);
    db.close();
  } catch {
    // Cache write failure is non-critical
  }
}

interface EmojiMartModules {
  data: unknown;
  Picker: unknown;
  _needsCache?: boolean;
}

let cached: Promise<EmojiMartModules> | undefined;

export function preloadEmojiMart(): Promise<EmojiMartModules> {
  if (cached) return cached;
  cached = (async () => {
    const [cachedData, mod] = await Promise.all([
      getCachedData(),
      import('@ikuradon/emoji-kitchen-mart')
    ]);

    if (cachedData) {
      return { data: cachedData, Picker: mod.Picker };
    }

    const rawData = await import('@ikuradon/emoji-kitchen-mart-data').then((m) => m.default);
    return { data: rawData, Picker: mod.Picker, _needsCache: true };
  })().catch((err) => {
    cached = undefined;
    throw err;
  });
  return cached;
}

export async function getEmojiMartModules(): Promise<EmojiMartModules> {
  const result = await preloadEmojiMart();
  if ('_needsCache' in result && result._needsCache) {
    delete result._needsCache;
    setTimeout(() => {
      void setCachedData(result.data);
    }, 1000);
  }
  return result;
}
