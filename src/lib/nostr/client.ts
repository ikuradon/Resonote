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
    rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays(DEFAULT_RELAYS);
    log.info('RxNostr initialized', { relays: DEFAULT_RELAYS });
    return rxNostr;
  })();

  return initPromise;
}

export function disposeRxNostr(): void {
  log.info('Disposing RxNostr');
  rxNostr?.dispose();
  rxNostr = undefined;
  initPromise = undefined;
}
