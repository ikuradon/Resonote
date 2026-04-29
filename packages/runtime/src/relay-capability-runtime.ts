import {
  calculateEffectiveRelayCapability,
  type RelayCapabilityLearningEvent,
  type RelayCapabilityRecord,
  type RelayExecutionCapability
} from '@auftakt/core';
import { Subject } from 'rxjs';

import {
  normalizeRelayCapabilitySnapshot,
  type RelayCapabilityPacket,
  type RelayCapabilitySnapshot,
  type RelayRuntimeCapabilityState
} from './relay-capability.js';

export const NIP11_SUCCESS_TTL_SECONDS = 3_600;
export const NIP11_FAILURE_TTL_SECONDS = 300;

export interface RelayInformationDocument {
  readonly supportedNips: readonly number[];
  readonly maxFilters: number | null;
  readonly maxSubscriptions: number | null;
}

export interface RelayCapabilityStore {
  getRelayCapability(relayUrl: string): Promise<RelayCapabilityRecord | null>;
  listRelayCapabilities(): Promise<RelayCapabilityRecord[]>;
  putRelayCapability(record: RelayCapabilityRecord): Promise<void>;
}

export interface RelayCapabilityRegistryOptions {
  readonly openStore: () => Promise<RelayCapabilityStore>;
  readonly now?: () => number;
  readonly fetchRelayInformation?: (relayUrl: string) => Promise<RelayInformationDocument>;
}

export interface RelayCapabilityRegistry {
  prefetchDefaultRelays(urls: readonly string[]): Promise<void>;
  snapshot(urls: readonly string[]): Promise<RelayCapabilitySnapshot[]>;
  observe(onPacket: (packet: RelayCapabilityPacket) => void): Promise<{ unsubscribe(): void }>;
  recordLearned(event: RelayCapabilityLearningEvent): Promise<void>;
  setRuntimeState(
    url: string,
    state: { readonly queueDepth: number; readonly activeSubscriptions: number }
  ): void;
  getExecutionCapabilities(
    urls: readonly string[]
  ): Promise<Record<string, RelayExecutionCapability>>;
}

export function createRelayCapabilityRegistry(
  options: RelayCapabilityRegistryOptions
): RelayCapabilityRegistry {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const fetchRelayInformation = options.fetchRelayInformation ?? fetchNip11RelayInformation;
  const packets = new Subject<RelayCapabilityPacket>();
  const runtimeState = new Map<string, { queueDepth: number; activeSubscriptions: number }>();

  async function readRecord(relayUrl: string): Promise<RelayCapabilityRecord | null> {
    const store = await options.openStore();
    return store.getRelayCapability(relayUrl);
  }

  async function writeRecord(record: RelayCapabilityRecord): Promise<void> {
    const store = await options.openStore();
    await store.putRelayCapability(record);
  }

  async function capabilityFor(relayUrl: string): Promise<RelayRuntimeCapabilityState> {
    const effective = calculateEffectiveRelayCapability(
      await readRecord(relayUrl),
      now(),
      {},
      relayUrl
    );
    const runtime = runtimeState.get(relayUrl) ?? { queueDepth: 0, activeSubscriptions: 0 };
    return { ...effective, ...runtime };
  }

  async function publish(relayUrl: string): Promise<void> {
    packets.next({
      from: relayUrl,
      capability: normalizeRelayCapabilitySnapshot(await capabilityFor(relayUrl))
    });
  }

  return {
    async prefetchDefaultRelays(urls) {
      for (const relayUrl of urls) {
        const record = await readRecord(relayUrl);
        const timestamp = now();
        if (record?.nip11ExpiresAt && record.nip11ExpiresAt > timestamp) {
          continue;
        }

        try {
          const info = await fetchRelayInformation(relayUrl);
          await writeRecord({
            relayUrl,
            nip11Status: 'ok',
            nip11CheckedAt: timestamp,
            nip11ExpiresAt: timestamp + NIP11_SUCCESS_TTL_SECONDS,
            supportedNips: [...info.supportedNips],
            nip11MaxFilters: info.maxFilters,
            nip11MaxSubscriptions: info.maxSubscriptions,
            learnedMaxFilters: record?.learnedMaxFilters ?? null,
            learnedMaxSubscriptions: record?.learnedMaxSubscriptions ?? null,
            learnedAt: record?.learnedAt ?? null,
            learnedReason: record?.learnedReason ?? null,
            updatedAt: timestamp
          });
        } catch {
          await writeRecord({
            relayUrl,
            nip11Status: 'failed',
            nip11CheckedAt: timestamp,
            nip11ExpiresAt: timestamp + NIP11_FAILURE_TTL_SECONDS,
            supportedNips: [],
            nip11MaxFilters: null,
            nip11MaxSubscriptions: null,
            learnedMaxFilters: record?.learnedMaxFilters ?? null,
            learnedMaxSubscriptions: record?.learnedMaxSubscriptions ?? null,
            learnedAt: record?.learnedAt ?? null,
            learnedReason: record?.learnedReason ?? null,
            updatedAt: timestamp
          });
        }

        await publish(relayUrl);
      }
    },

    async snapshot(urls) {
      const snapshots: RelayCapabilitySnapshot[] = [];
      for (const url of urls) {
        snapshots.push(normalizeRelayCapabilitySnapshot(await capabilityFor(url)));
      }
      return snapshots;
    },

    async observe(onPacket) {
      const sub = packets.subscribe({ next: onPacket });
      return { unsubscribe: () => sub.unsubscribe() };
    },

    async recordLearned(event) {
      const record = await readRecord(event.relayUrl);
      const timestamp = now();
      await writeRecord({
        relayUrl: event.relayUrl,
        nip11Status: record?.nip11Status ?? 'unknown',
        nip11CheckedAt: record?.nip11CheckedAt ?? null,
        nip11ExpiresAt: record?.nip11ExpiresAt ?? null,
        supportedNips: record?.supportedNips ?? [],
        nip11MaxFilters: record?.nip11MaxFilters ?? null,
        nip11MaxSubscriptions: record?.nip11MaxSubscriptions ?? null,
        learnedMaxFilters:
          event.kind === 'maxFilters'
            ? tighten(record?.learnedMaxFilters ?? null, event.value)
            : (record?.learnedMaxFilters ?? null),
        learnedMaxSubscriptions:
          event.kind === 'maxSubscriptions'
            ? tighten(record?.learnedMaxSubscriptions ?? null, event.value)
            : (record?.learnedMaxSubscriptions ?? null),
        learnedAt: timestamp,
        learnedReason: event.reason,
        updatedAt: timestamp
      });
      await publish(event.relayUrl);
    },

    setRuntimeState(url, state) {
      runtimeState.set(url, state);
      void publish(url);
    },

    async getExecutionCapabilities(urls) {
      const entries = await Promise.all(
        urls.map(
          async (url) =>
            [url, calculateEffectiveRelayCapability(await readRecord(url), now(), {}, url)] as const
        )
      );
      return Object.fromEntries(entries);
    }
  };
}

export async function fetchNip11RelayInformation(
  relayUrl: string
): Promise<RelayInformationDocument> {
  const url = relayUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const response = await fetch(url, {
    headers: { Accept: 'application/nostr+json' }
  });
  if (!response.ok) {
    throw new Error(`NIP-11 fetch failed: ${relayUrl}:${response.status}`);
  }

  const document = (await response.json()) as {
    supported_nips?: unknown;
    limitation?: {
      max_filters?: unknown;
      max_subscriptions?: unknown;
    };
  };

  return {
    supportedNips: Array.isArray(document.supported_nips)
      ? document.supported_nips.filter((value): value is number => Number.isInteger(value))
      : [],
    maxFilters: normalizePositiveInteger(document.limitation?.max_filters),
    maxSubscriptions: normalizePositiveInteger(document.limitation?.max_subscriptions)
  };
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : null;
}

function tighten(current: number | null, next: number): number {
  return current === null ? next : Math.min(current, next);
}
