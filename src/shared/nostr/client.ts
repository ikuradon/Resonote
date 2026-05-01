import {
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot,
  type RelayObservationPacket,
  type RelayObservationRuntime,
  type RelayObservationSnapshot
} from '@auftakt/core';
import { createRelaySession, nip07Signer } from '@auftakt/runtime';
import type { EventParameters } from 'nostr-typedef';

import { fetchMaterializedLatestEvent } from '$shared/nostr/materialized-latest.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:client');

interface PublishAckPacket {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly ok: boolean;
}

interface RelayPublishOptions {
  readonly on?: {
    readonly relays?: readonly string[];
    readonly defaultWriteRelays?: boolean;
  };
}

type RelaySession = ReturnType<typeof createRelaySession>;

let initPromise: Promise<RelaySession> | undefined;
let relaySession: RelaySession | undefined;
const publishAckHistory = new Map<string, PublishAckPacket[]>();

export async function getRelaySession(): Promise<RelaySession> {
  if (relaySession) return relaySession;
  if (initPromise) return initPromise;

  log.info('Initializing RelaySession...');

  relaySession = createRelaySession({
    defaultRelays: DEFAULT_RELAYS,
    eoseTimeout: 10_000
  });
  log.info('RelaySession initialized', { relays: DEFAULT_RELAYS });
  initPromise = Promise.resolve(relaySession);

  return initPromise;
}

export async function getDefaultRelayUrls(): Promise<string[]> {
  const instance = await getRelaySession();
  return Object.keys(instance.getDefaultRelays());
}

export async function castSigned(
  params: EventParameters,
  options?: { successThreshold?: number } & RelayPublishOptions
): Promise<void> {
  const threshold = options?.successThreshold ?? 0.5;
  const instance = await getRelaySession();
  const relayCount = Object.keys(instance.getDefaultRelays()).length;
  const targetRelayCount = options?.on?.relays?.length ?? relayCount;
  const needed = Math.max(1, Math.ceil(targetRelayCount * threshold));

  return new Promise<void>((resolve, reject) => {
    let okCount = 0;
    let resolved = false;

    const sendOptions = options?.on
      ? {
          signer: nip07Signer(),
          on: {
            relays: options.on.relays ? [...options.on.relays] : undefined,
            defaultWriteRelays: options.on.defaultWriteRelays
          }
        }
      : { signer: nip07Signer() };

    const sub = instance.send(params, sendOptions).subscribe({
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
  return fetchMaterializedLatestEvent(pubkey, kind);
}

export async function setDefaultRelays(urls: string[]): Promise<void> {
  const instance = await getRelaySession();
  instance.setDefaultRelays(urls);
}

function createRelayObservationRuntime(instance: RelaySession): RelayObservationRuntime {
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
  const instance = await getRelaySession();
  return createRelayObservationRuntime(instance).getRelayConnectionState(url);
}

export async function observeRelayConnectionStates(
  onPacket: (packet: RelayObservationPacket) => void
): Promise<{ unsubscribe(): void }> {
  const instance = await getRelaySession();
  return createRelayObservationRuntime(instance).observeRelayConnectionStates(onPacket);
}
export function disposeRelaySession(): void {
  log.info('Disposing RelaySession');
  relaySession?.dispose();
  relaySession = undefined;
  initPromise = undefined;
  publishAckHistory.clear();
}
