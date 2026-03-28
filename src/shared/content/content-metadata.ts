/**
 * Content metadata cache + fetch for resolving titles of external content.
 * Used by content-link segments in comment rendering.
 */

import { apiClient } from '$shared/api/client.js';
import { createLogger } from '$shared/utils/logger.js';

import type { ContentId } from './types.js';

const log = createLogger('content-metadata');

export interface ContentMetadata {
  title: string | null;
  subtitle: string | null;
  thumbnailUrl: string | null;
  provider: string;
}

/** Must match PLATFORMS keys in src/server/api/oembed.ts */
const SUPPORTED_PLATFORMS = new Set(['spotify', 'youtube', 'soundcloud', 'vimeo']);
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  metadata: ContentMetadata | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ContentMetadata | null>>();

function cacheKey(contentId: ContentId): string {
  return `${contentId.platform}:${contentId.type}:${contentId.id}`;
}

export function getContentMetadata(contentId: ContentId): ContentMetadata | null {
  const entry = cache.get(cacheKey(contentId));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(cacheKey(contentId));
    return null;
  }
  return entry.metadata;
}

export async function fetchContentMetadata(contentId: ContentId): Promise<ContentMetadata | null> {
  if (!SUPPORTED_PLATFORMS.has(contentId.platform)) return null;

  const key = cacheKey(contentId);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt <= CACHE_TTL_MS) {
    return cached.metadata;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = doFetch(contentId, key);
  inflight.set(key, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

async function doFetch(contentId: ContentId, key: string): Promise<ContentMetadata | null> {
  try {
    const res = await apiClient.api.oembed.resolve.$get({
      query: {
        platform: contentId.platform,
        type: contentId.type,
        id: contentId.id
      }
    });
    if (!res.ok) {
      log.warn('oEmbed resolve failed', { status: res.status, key });
      // Cache null only for client errors (4xx) — transient server errors (5xx) should retry
      if (res.status < 500) {
        cache.set(key, { metadata: null, fetchedAt: Date.now() });
      }
      return null;
    }

    const data = (await res.json()) as {
      title?: string | null;
      subtitle?: string | null;
      thumbnailUrl?: string | null;
      provider?: string;
    };

    const metadata: ContentMetadata = {
      title: data.title ?? null,
      subtitle: data.subtitle ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      provider: data.provider ?? contentId.platform
    };

    cache.set(key, { metadata, fetchedAt: Date.now() });
    return metadata;
  } catch (err) {
    log.warn('oEmbed fetch error', { error: err, key });
    // Don't cache network errors — they are transient
    return null;
  }
}

/** Reset cache state (for tests). */
export function resetContentMetadataCache(): void {
  cache.clear();
  inflight.clear();
}
