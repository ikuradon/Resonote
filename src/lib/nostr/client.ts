import type { RxNostr } from 'rx-nostr';
import { createLogger } from '../utils/logger.js';

const log = createLogger('nostr:client');

let initPromise: Promise<RxNostr> | undefined;
let rxNostr: RxNostr | undefined;

export async function getRxNostr(): Promise<RxNostr> {
  if (rxNostr) return rxNostr;
  if (initPromise) return initPromise;

  log.info('Initializing RxNostr...');

  initPromise = (async () => {
    const [{ createRxNostr }, { verifier }, { DEFAULT_RELAYS }] = await Promise.all([
      import('rx-nostr'),
      import('@rx-nostr/crypto'),
      import('./relays.js')
    ]);
    rxNostr = createRxNostr({ verifier, eoseTimeout: 10_000 });
    rxNostr.setDefaultRelays(DEFAULT_RELAYS);
    log.info('RxNostr initialized', { relays: DEFAULT_RELAYS });
    return rxNostr;
  })();

  return initPromise;
}

/**
 * Sign and send an event to default relays via NIP-07 signer.
 * Resolves when a threshold percentage of relays accept the event.
 */
export async function castSigned(
  params: import('nostr-typedef').EventParameters,
  options?: { successThreshold?: number }
): Promise<void> {
  const threshold = options?.successThreshold ?? 0.5;
  const [{ nip07Signer }, instance] = await Promise.all([import('rx-nostr'), getRxNostr()]);
  const relayCount = Object.keys(instance.getDefaultRelays()).length;
  const needed = Math.max(1, Math.ceil(relayCount * threshold));

  return new Promise<void>((resolve, reject) => {
    let okCount = 0;
    let resolved = false;

    instance.send(params, { signer: nip07Signer() }).subscribe({
      next: (packet) => {
        if (packet.ok) okCount++;
        if (!resolved && okCount >= needed) {
          resolved = true;
          resolve();
        }
      },
      error: (err) => {
        if (!resolved) reject(err);
      },
      complete: () => {
        if (!resolved) {
          if (okCount > 0) resolve();
          else reject(new Error('All relays rejected the event'));
        }
      }
    });
  });
}

/**
 * Fetch the latest event matching a kind and author from relays.
 * Returns null if no event found.
 */
export async function fetchLatestEvent(
  pubkey: string,
  kind: number
): Promise<{ tags: string[][]; content: string; created_at: number } | null> {
  const [{ createRxBackwardReq }] = await Promise.all([import('rx-nostr')]);
  const rxNostr = await getRxNostr();

  const fetchPromise = new Promise<{
    tags: string[][];
    content: string;
    created_at: number;
  } | null>((resolve) => {
    const req = createRxBackwardReq();
    let latest: { tags: string[][]; content: string; created_at: number } | null = null;

    const sub = rxNostr.use(req).subscribe({
      next: (packet) => {
        if (!latest || packet.event.created_at > latest.created_at) {
          latest = packet.event;
        }
      },
      complete: () => {
        sub.unsubscribe();
        resolve(latest);
      },
      error: () => {
        sub.unsubscribe();
        resolve(latest);
      }
    });

    req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
    req.over();
  });

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 10_000);
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}

export function disposeRxNostr(): void {
  log.info('Disposing RxNostr');
  rxNostr?.dispose();
  rxNostr = undefined;
  initPromise = undefined;
}
