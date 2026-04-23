import { createRxNostrSession, nip07Signer, type RxNostr } from '@auftakt/adapter-relay';
import {
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot,
  type RelayObservationPacket,
  type RelayObservationRuntime,
  type RelayObservationSnapshot
} from '@auftakt/core';
import { createRuntimeRequestKey } from '@auftakt/timeline';
import type { EventParameters } from 'nostr-typedef';

import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:client');

let initPromise: Promise<RxNostr> | undefined;
let rxNostr: RxNostr | undefined;

export async function getRxNostr(): Promise<RxNostr> {
  if (rxNostr) return rxNostr;
  if (initPromise) return initPromise;

  log.info('Initializing RxNostr...');

  rxNostr = createRxNostrSession({ defaultRelays: DEFAULT_RELAYS, eoseTimeout: 10_000 });
  log.info('RxNostr initialized', { relays: DEFAULT_RELAYS });
  initPromise = Promise.resolve(rxNostr);

  return initPromise;
}

export async function castSigned(
  params: EventParameters,
  options?: { successThreshold?: number }
): Promise<void> {
  const threshold = options?.successThreshold ?? 0.5;
  const instance = await getRxNostr();
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
  kind: number
): Promise<{ tags: string[][]; content: string; created_at: number } | null> {
  const { createRxBackwardReq } = await import('@auftakt/adapter-relay');
  const instance = await getRxNostr();

  return new Promise<{ tags: string[][]; content: string; created_at: number } | null>(
    (resolve) => {
      const requestKey = createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ kinds: [kind], authors: [pubkey], limit: 1 }],
        scope: 'shared:nostr:client:fetchLatestEvent'
      });
      const req = createRxBackwardReq({ requestKey });
      let latest: { tags: string[][]; content: string; created_at: number } | null = null;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          resolve(latest);
        }
      }, 10_000);

      const sub = instance.use(req).subscribe({
        next: (packet) => {
          if (!latest || packet.event.created_at > latest.created_at) {
            latest = packet.event;
          }
          import('$shared/nostr/event-db.js')
            .then(({ getEventsDB }) => getEventsDB())
            .then((db) => db.put(packet.event))
            .catch((e) => log.error('Failed to cache event to IndexedDB', e));
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
    }
  );
}

export async function setDefaultRelays(urls: string[]): Promise<void> {
  const instance = await getRxNostr();
  instance.setDefaultRelays(urls);
}

function createRelayObservationRuntime(instance: RxNostr): RelayObservationRuntime {
  return {
    getRelayConnectionState(url: string): RelayObservationSnapshot | null {
      const status = instance.getRelayStatus(url);
      if (!status) return null;
      return normalizeRelayObservationSnapshot({
        url,
        connection: status.connection,
        reason: status.reason,
        aggregate: status.aggregate
      });
    },
    observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): {
      unsubscribe(): void;
    } {
      return instance.createConnectionStateObservable().subscribe((packet) =>
        onPacket(
          normalizeRelayObservationPacket({
            from: packet.from,
            state: packet.state,
            reason: packet.reason,
            aggregate: packet.aggregate
          })
        )
      );
    }
  };
}

export async function getRelayConnectionState(
  url: string
): Promise<RelayObservationSnapshot | null> {
  const instance = await getRxNostr();
  return createRelayObservationRuntime(instance).getRelayConnectionState(url);
}

export async function observeRelayConnectionStates(
  onPacket: (packet: RelayObservationPacket) => void
): Promise<{ unsubscribe(): void }> {
  const instance = await getRxNostr();
  return createRelayObservationRuntime(instance).observeRelayConnectionStates(onPacket);
}
export function disposeRxNostr(): void {
  log.info('Disposing RxNostr');
  rxNostr?.dispose();
  rxNostr = undefined;
  initPromise = undefined;
}
