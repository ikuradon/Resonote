import type { Event as NostrEvent, EventParameters } from 'nostr-typedef';
import type { RxNostr } from 'rx-nostr';

import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:client');

let initPromise: Promise<RxNostr> | undefined;
let rxNostr: RxNostr | undefined;

export async function getRxNostr(): Promise<RxNostr> {
  if (rxNostr) return rxNostr;
  if (initPromise) return initPromise;

  log.info('Initializing RxNostr...');

  initPromise = (async () => {
    const [{ createRxNostr }, { verifier }] = await Promise.all([
      import('rx-nostr'),
      import('@rx-nostr/crypto')
    ]);
    rxNostr = createRxNostr({ verifier, eoseTimeout: 10_000 });
    rxNostr.setDefaultRelays(DEFAULT_RELAYS);
    log.info('RxNostr initialized', { relays: DEFAULT_RELAYS });
    return rxNostr;
  })();

  return initPromise;
}

export async function castSigned(
  params: EventParameters,
  options?: { successThreshold?: number }
): Promise<void> {
  const threshold = options?.successThreshold ?? 0.5;
  const [{ nip07Signer }, instance] = await Promise.all([import('rx-nostr'), getRxNostr()]);
  const relayCount = Object.keys(instance.getDefaultRelays()).length;
  const needed = Math.max(1, Math.ceil(relayCount * threshold));

  return new Promise<void>((resolve, reject) => {
    let okCount = 0;
    let resolved = false;

    const sub = instance.send(params, { signer: nip07Signer() }).subscribe({
      next: (packet) => {
        if (packet.ok) okCount++;
        if (!resolved && okCount >= needed) {
          resolved = true;
          sub.unsubscribe();
          resolve();
        }
      },
      error: (err) => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          reject(err);
        }
      },
      complete: () => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          if (okCount > 0) resolve();
          else reject(new Error('All relays rejected the event'));
        }
      }
    });
  });
}

export async function fetchLatestEvent(
  pubkey: string,
  kind: number,
  options?: { timeout?: number }
): Promise<NostrEvent | null> {
  const { createRxBackwardReq } = await import('rx-nostr');
  const instance = await getRxNostr();
  const timeoutMs = options?.timeout ?? 10_000;

  return new Promise<NostrEvent | null>((resolve) => {
    const req = createRxBackwardReq();
    let latest: NostrEvent | null = null;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        sub.unsubscribe();
        resolve(latest);
      }
    }, timeoutMs);

    const sub = instance.use(req).subscribe({
      next: (packet) => {
        if (!latest || packet.event.created_at > latest.created_at) {
          latest = packet.event;
        }
        // connectStore() handles caching to auftakt store automatically
      },
      complete: () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(latest);
        }
      },
      error: () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          sub.unsubscribe();
          resolve(latest);
        }
      }
    });

    req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
    req.over();
  });
}

export function disposeRxNostr(): void {
  log.info('Disposing RxNostr');
  rxNostr?.dispose();
  rxNostr = undefined;
  initPromise = undefined;
}
