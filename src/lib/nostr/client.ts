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

export function disposeRxNostr(): void {
  log.info('Disposing RxNostr');
  rxNostr?.dispose();
  rxNostr = undefined;
  initPromise = undefined;
}
