import { normalizeUrl } from './url-utils.js';

let cachedPubkey: string | undefined;

/**
 * Fetch system pubkey from API (cached after first call).
 * Returns empty string if not configured.
 */
export async function getSystemPubkey(): Promise<string> {
  if (cachedPubkey) return cachedPubkey;
  try {
    const res = await fetch('/api/system/pubkey');
    if (!res.ok) return '';
    const data = await res.json();
    cachedPubkey = (data.pubkey as string) ?? '';
    return cachedPubkey!;
  } catch {
    return '';
  }
}

interface DTagResult {
  guid: string;
  feedUrl: string;
  enclosureUrl: string;
}

/**
 * Parse a kind:39701 event's tags to extract guid, feedUrl, enclosureUrl.
 * Looks for 'i' tags:
 * - 'podcast:item:guid:xxx' prefix → extract guid, hint = enclosureUrl
 * - 'podcast:guid:xxx' prefix → hint = feedUrl
 * Returns null if either is missing.
 */
export function parseDTagEvent(event: { kind: number; tags: string[][] }): DTagResult | null {
  let guid: string | undefined;
  let feedUrl: string | undefined;
  let enclosureUrl: string | undefined;

  for (const tag of event.tags) {
    if (tag[0] !== 'i') continue;
    const value = tag[1];
    const hint = tag[2];
    if (!value) continue;

    if (value.startsWith('podcast:item:guid:')) {
      if (!hint) return null;
      guid = value.slice('podcast:item:guid:'.length);
      enclosureUrl = hint;
    } else if (value.startsWith('podcast:guid:')) {
      if (!hint) return null;
      feedUrl = hint;
    }
  }

  if (!guid || !feedUrl || !enclosureUrl) return null;
  return { guid, feedUrl, enclosureUrl };
}

/**
 * Query relays for existing d-tag resolution.
 */
export async function resolveByDTag(
  url: string,
  rxNostrQuery: (filter: Record<string, unknown>) => Promise<{ tags: string[][] } | null>
): Promise<DTagResult | null> {
  const pubkey = await getSystemPubkey();
  if (!pubkey) return null;
  const normalized = normalizeUrl(url);
  const event = await rxNostrQuery({
    kinds: [39701],
    authors: [pubkey],
    '#d': [normalized]
  });
  if (!event) return null;
  return parseDTagEvent({ kind: 39701, tags: event.tags });
}

// API response types
export interface ResolveApiResponse {
  type: 'episode' | 'feed' | 'redirect';
  feed?: { guid: string; title: string; feedUrl: string; image: string };
  episode?: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
  };
  episodes?: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
  }[];
  feedUrl?: string;
  signedEvents?: Record<string, unknown>[];
  error?: string;
}

/**
 * Call the API to resolve a URL.
 */
export async function resolveByApi(url: string): Promise<ResolveApiResponse> {
  const res = await fetch(`/api/podcast/resolve?url=${encodeURIComponent(url)}`);
  if (!res.ok) return { type: 'episode', error: 'fetch_failed' };
  return res.json();
}
