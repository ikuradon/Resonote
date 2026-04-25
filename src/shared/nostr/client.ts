import { createRxNostrSession, nip07Signer, type RxNostr } from '@auftakt/core';
import {
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot,
  type RelayObservationPacket,
  type RelayObservationRuntime,
  type RelayObservationSnapshot
} from '@auftakt/core';
import type { EventParameters } from 'nostr-typedef';

import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:client');

interface PublishAckPacket {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly ok: boolean;
}

let initPromise: Promise<RxNostr> | undefined;
let rxNostr: RxNostr | undefined;
const publishAckHistory = new Map<string, PublishAckPacket[]>();

export async function getRxNostr(): Promise<RxNostr> {
  if (rxNostr) return rxNostr;
  if (initPromise) return initPromise;

  log.info('Initializing RxNostr...');

  rxNostr = createRxNostrSession({
    defaultRelays: DEFAULT_RELAYS,
    eoseTimeout: 10_000
  });
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
        const history = publishAckHistory.get(packet.eventId) ?? [];
        history.push({ eventId: packet.eventId, relayUrl: packet.from, ok: packet.ok });
        publishAckHistory.set(packet.eventId, history);
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

export async function observePublishAcks(
  event: { readonly id: string },
  onAck: (packet: PublishAckPacket) => Promise<void> | void
): Promise<void> {
  for (const packet of publishAckHistory.get(event.id) ?? []) {
    await onAck(packet);
  }
}

export async function fetchLatestEvent(
  pubkey: string,
  kind: number
): Promise<{ tags: string[][]; content: string; created_at: number } | null> {
  const { fetchBackwardFirst } = await import('$shared/nostr/query.js');
  const event = await fetchBackwardFirst<{
    tags: string[][];
    content: string;
    created_at: number;
  }>([{ kinds: [kind], authors: [pubkey], limit: 1 }], { timeoutMs: 10_000 });
  return event ? { tags: event.tags, content: event.content, created_at: event.created_at } : null;
}

export async function setDefaultRelays(urls: string[]): Promise<void> {
  const instance = await getRxNostr();
  instance.setDefaultRelays(urls);
}

function createRelayObservationRuntime(instance: RxNostr): RelayObservationRuntime {
  return {
    getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null> {
      const status = instance.getRelayStatus(url);
      if (!status) return Promise.resolve(null);
      return Promise.resolve(
        normalizeRelayObservationSnapshot({
          url,
          connection: status.connection,
          reason: status.reason,
          aggregate: status.aggregate
        })
      );
    },
    observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): Promise<{
      unsubscribe(): void;
    }> {
      return Promise.resolve(
        instance.createConnectionStateObservable().subscribe({
          next: (packet) =>
            onPacket(
              normalizeRelayObservationPacket({
                from: packet.from,
                state: packet.state,
                reason: packet.reason,
                aggregate: packet.aggregate
              })
            )
        })
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
  publishAckHistory.clear();
}
