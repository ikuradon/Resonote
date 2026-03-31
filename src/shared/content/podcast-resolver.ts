// @public — Stable API for route/component/feature consumers
import type { EventParameters } from 'nostr-typedef';

import { apiClient } from '$shared/api/client.js';
import { normalizeUrl } from '$shared/content/url-utils.js';
import { getRxNostr } from '$shared/nostr/client.js';
import { getStore } from '$shared/nostr/store.js';
import { htmlToMarkdown } from '$shared/utils/html.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('podcast-resolver');

let pubkeyPromise: Promise<string> | undefined;

export function getSystemPubkey(): Promise<string> {
  pubkeyPromise ??= apiClient.api.system.pubkey
    .$get()
    .then((res) => {
      if (!res.ok) {
        pubkeyPromise = undefined;
        return '';
      }
      return res.json().then((data: unknown) => {
        if (
          typeof data === 'object' &&
          data !== null &&
          typeof (data as Record<string, unknown>).pubkey === 'string'
        ) {
          return (data as Record<string, unknown>).pubkey as string;
        }
        pubkeyPromise = undefined;
        return '';
      });
    })
    .catch((e) => {
      log.warn('Failed to fetch system pubkey', e);
      pubkeyPromise = undefined;
      return '';
    });
  return pubkeyPromise;
}

export interface DTagResult {
  guid: string;
  feedUrl: string;
  enclosureUrl: string;
  description?: string;
}

export function parseDTagEvent(event: {
  kind: number;
  tags: string[][];
  content?: string;
}): DTagResult | null {
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
  const rawDesc = event.content || undefined;
  return {
    guid,
    feedUrl,
    enclosureUrl,
    description: rawDesc ? htmlToMarkdown(rawDesc) : undefined
  };
}

export async function resolveByDTag(
  url: string,
  rxNostrQuery: (
    filter: Record<string, unknown>
  ) => Promise<{ tags: string[][]; content?: string } | null>
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
  return parseDTagEvent({ kind: 39701, tags: event.tags, content: event.content });
}

export interface ResolveApiResponse {
  type: 'episode' | 'feed' | 'redirect';
  feed?: { guid: string; title: string; feedUrl: string; imageUrl: string; description?: string };
  episode?: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
    description?: string;
  };
  episodes?: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
    description?: string;
  }[];
  feedUrl?: string;
  signedEvents?: EventParameters[];
  metadata?: { title?: string; artist?: string; album?: string; image?: string };
  error?: string;
}

export async function searchBookmarkByUrl(url: string): Promise<DTagResult | null> {
  try {
    const pubkey = await getSystemPubkey();
    if (!pubkey) return null;

    const normalized = normalizeUrl(url);

    try {
      const store = getStore();
      const cachedResults = await store.getSync({
        kinds: [39701],
        authors: [pubkey],
        '#d': [normalized],
        limit: 1
      });
      if (cachedResults.length > 0) {
        const cached = cachedResults[0].event;
        const result = parseDTagEvent({ kind: 39701, tags: cached.tags, content: cached.content });
        if (result) return result;
      }
    } catch {
      // Store not available
    }

    const { createRxBackwardReq, uniq } = await import('rx-nostr');

    const rxNostr = await getRxNostr();
    const req = createRxBackwardReq();

    const filter = {
      kinds: [39701],
      authors: [pubkey],
      '#d': [normalized],
      limit: 1
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packet = await new Promise<any>((resolve) => {
      const timer = setTimeout(() => {
        sub.unsubscribe();
        resolve(null);
      }, 5000);

      const sub = rxNostr
        .use(req)
        .pipe(uniq())
        .subscribe({
          next: (p) => {
            clearTimeout(timer);
            sub.unsubscribe();
            resolve(p);
          },
          complete: () => {
            clearTimeout(timer);
            resolve(null);
          }
        });

      req.emit(filter);
      req.over();
    });

    if (!packet) return null;

    // connectStore() handles caching automatically

    return parseDTagEvent({
      kind: 39701,
      tags: packet.event.tags,
      content: packet.event.content
    });
  } catch {
    return null;
  }
}

const VALID_TYPES = new Set(['episode', 'feed', 'redirect']);

async function validateResolveResponse(data: unknown): Promise<ResolveApiResponse> {
  if (typeof data !== 'object' || data === null) {
    return { type: 'episode', error: 'invalid_response' };
  }
  const obj = data as Record<string, unknown>;
  const type = VALID_TYPES.has(obj.type as string)
    ? (obj.type as ResolveApiResponse['type'])
    : 'episode';
  const result = { ...obj, type } as ResolveApiResponse;

  // Verify signedEvents with cryptographic signature check
  if (Array.isArray(result.signedEvents) && result.signedEvents.length > 0) {
    const { verifier } = await import('@rx-nostr/crypto');
    const verified: EventParameters[] = [];
    for (const event of result.signedEvents) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (await verifier(event as any)) verified.push(event);
      } catch {
        // Invalid event shape or failed signature — skip
      }
    }
    result.signedEvents = verified.length > 0 ? verified : undefined;
  } else {
    result.signedEvents = undefined;
  }

  return result;
}

export async function resolveByApi(url: string): Promise<ResolveApiResponse> {
  const res = await apiClient.api.podcast.resolve.$get({ query: { url } });
  if (!res.ok) return { type: 'episode', error: 'fetch_failed' };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { type: 'episode', error: 'invalid_response' };
  }
  try {
    return await validateResolveResponse(data);
  } catch {
    return { type: 'episode', error: 'invalid_response' };
  }
}
