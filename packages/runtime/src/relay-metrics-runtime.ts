import type {
  Nip66RelayDiscovery,
  Nip66RelayMonitorAnnouncement,
  StoredEvent
} from '@auftakt/core';
import {
  calculateNip66RelayScore,
  NIP66_RELAY_DISCOVERY_KIND,
  NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND,
  parseNip66RelayDiscoveryEvent,
  parseNip66RelayMonitorAnnouncement
} from '@auftakt/core';

export interface RelayMetricSnapshot {
  readonly relayUrl: string;
  readonly monitorPubkey: string;
  readonly score: number;
  readonly updatedAt: number;
  readonly supportedNips: readonly number[];
  readonly requirements: readonly string[];
  readonly networkTypes: readonly string[];
  readonly relayTypes: readonly string[];
  readonly topics: readonly string[];
  readonly geohashes: readonly string[];
  readonly rttOpenMs: number | null;
  readonly rttReadMs: number | null;
  readonly rttWriteMs: number | null;
  readonly monitorAnnouncement: Nip66RelayMonitorAnnouncement | null;
}

export interface RelayMetricStoreRuntime {
  getEventsDB(): Promise<{ getAllByKind(kind: number): Promise<StoredEvent[]> }>;
}

export interface RelayMetricsCoordinator {
  snapshotRelayMetrics(): Promise<RelayMetricSnapshot[]>;
}

export async function snapshotRelayMetricsFromStore(
  runtime: RelayMetricStoreRuntime
): Promise<RelayMetricSnapshot[]> {
  const db = await runtime.getEventsDB();
  const [discoveryEvents, monitorEvents] = await Promise.all([
    db.getAllByKind(NIP66_RELAY_DISCOVERY_KIND),
    db.getAllByKind(NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND)
  ]);
  const announcements = new Map<string, Nip66RelayMonitorAnnouncement>();
  for (const event of monitorEvents) {
    const announcement = parseNip66RelayMonitorAnnouncement(event);
    if (!announcement) continue;
    const existing = announcements.get(announcement.monitorPubkey);
    if (!existing || existing.createdAt < announcement.createdAt) {
      announcements.set(announcement.monitorPubkey, announcement);
    }
  }

  return discoveryEvents
    .map(parseNip66RelayDiscoveryEvent)
    .filter((discovery): discovery is Nip66RelayDiscovery => discovery !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((discovery) => ({
      relayUrl: discovery.relayUrl,
      monitorPubkey: discovery.monitorPubkey,
      score: calculateNip66RelayScore(discovery),
      updatedAt: discovery.createdAt,
      supportedNips: discovery.supportedNips,
      requirements: discovery.requirements,
      networkTypes: discovery.networkTypes,
      relayTypes: discovery.relayTypes,
      topics: discovery.topics,
      geohashes: discovery.geohashes,
      rttOpenMs: discovery.rttOpenMs,
      rttReadMs: discovery.rttReadMs,
      rttWriteMs: discovery.rttWriteMs,
      monitorAnnouncement: announcements.get(discovery.monitorPubkey) ?? null
    }));
}

export async function snapshotRelayMetrics(
  coordinator: RelayMetricsCoordinator
): Promise<RelayMetricSnapshot[]> {
  return coordinator.snapshotRelayMetrics();
}
