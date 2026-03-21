// @public — Stable API for route/component/feature consumers
import type { EventParameters } from 'nostr-typedef';
import { normalizeUrl } from '$shared/content/url-utils.js';
import { getEventsDB, getRxNostr } from '$shared/nostr/gateway.js';

let pubkeyPromise: Promise<string> | undefined;

export function getSystemPubkey(): Promise<string> {
  if (!pubkeyPromise) {
    pubkeyPromise = fetch('/api/system/pubkey')
      .then((res) => {
        if (!res.ok) {
          pubkeyPromise = undefined;
          return '';
        }
        return res.json().then((data) => (data.pubkey as string) ?? '');
      })
      .catch(() => {
        pubkeyPromise = undefined;
        return '';
      });
  }
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
  return { guid, feedUrl, enclosureUrl, description: event.content || undefined };
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
  feed?: { guid: string; title: string; feedUrl: string; imageUrl: string };
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
      const db = await getEventsDB();
      const cached = await db.getByReplaceKey(pubkey, 39701, normalized);
      if (cached) {
        const result = parseDTagEvent({ kind: 39701, tags: cached.tags, content: cached.content });
        if (result) return result;
      }
    } catch {
      // DB not available
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

    try {
      const db = await getEventsDB();
      await db.put(packet.event);
    } catch {
      // DB not available
    }

    return parseDTagEvent({
      kind: 39701,
      tags: packet.event.tags,
      content: packet.event.content
    });
  } catch {
    return null;
  }
}

export async function resolveByApi(url: string): Promise<ResolveApiResponse> {
  const res = await fetch(`/api/podcast/resolve?url=${encodeURIComponent(url)}`);
  if (!res.ok) return { type: 'episode', error: 'fetch_failed' };
  return res.json();
}
