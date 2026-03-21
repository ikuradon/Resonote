/**
 * WoT fetcher — encapsulates rx-nostr subscription for follows + 2-hop WoT.
 */

import { extractFollows } from '../domain/follow-model.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('wot-fetcher');
const FOLLOW_KIND = 3;
const BATCH_SIZE = 100;

export interface WotResult {
  directFollows: Set<string>;
  wot: Set<string>;
}

export interface WotProgressCallback {
  onDirectFollows: (follows: Set<string>) => void;
  onWotProgress: (count: number) => void;
  isCancelled: () => boolean;
}

export async function fetchWot(pubkey: string, callbacks: WotProgressCallback): Promise<WotResult> {
  const [{ createRxBackwardReq }, { getRxNostr, getEventsDB }] = await Promise.all([
    import('rx-nostr'),
    import('$shared/nostr/gateway.js')
  ]);
  const rxNostr = await getRxNostr();
  const eventsDB = await getEventsDB();

  // Step 1: Fetch direct follows
  const directFollows = await new Promise<Set<string>>((resolve) => {
    const req = createRxBackwardReq();
    let latestEvent: { tags: string[][]; created_at: number } | null = null;

    const sub = rxNostr.use(req).subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => {
        eventsDB.put(packet.event);
        if (!latestEvent || packet.event.created_at > latestEvent.created_at) {
          latestEvent = packet.event;
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(latestEvent ? extractFollows(latestEvent) : new Set());
      },
      error: () => {
        sub.unsubscribe();
        resolve(latestEvent ? extractFollows(latestEvent) : new Set());
      }
    });

    req.emit({ kinds: [FOLLOW_KIND], authors: [pubkey], limit: 1 });
    req.over();
  });

  if (callbacks.isCancelled()) return { directFollows, wot: directFollows };

  log.info('Direct follows loaded', { count: directFollows.size });
  callbacks.onDirectFollows(directFollows);

  if (directFollows.size === 0) {
    return { directFollows, wot: new Set([pubkey]) };
  }

  // Step 2: Fetch 2nd-hop contact lists
  const allWot = new Set([...directFollows, pubkey]);
  const followArray = [...directFollows];

  await new Promise<void>((resolve) => {
    const req = createRxBackwardReq();

    const sub = rxNostr.use(req).subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => {
        if (callbacks.isCancelled()) return;
        eventsDB.put(packet.event);
        for (const tag of packet.event.tags) {
          if (tag[0] === 'p' && tag[1]) allWot.add(tag[1]);
        }
        callbacks.onWotProgress(allWot.size);
      },
      complete: () => {
        sub.unsubscribe();
        resolve();
      },
      error: () => {
        sub.unsubscribe();
        resolve();
      }
    });

    for (let i = 0; i < followArray.length; i += BATCH_SIZE) {
      req.emit({ kinds: [FOLLOW_KIND], authors: followArray.slice(i, i + BATCH_SIZE) });
    }
    req.over();
  });

  return { directFollows, wot: new Set(allWot) };
}
