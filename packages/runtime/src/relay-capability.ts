import type { RelayExecutionCapability } from '@auftakt/core';

export interface RelayCapabilitySnapshot extends Omit<RelayExecutionCapability, 'relayUrl'> {
  readonly url: string;
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
}

export interface RelayCapabilityPacket {
  readonly from: string;
  readonly capability: RelayCapabilitySnapshot;
}

export interface RelayRuntimeCapabilityState extends RelayExecutionCapability {
  readonly queueDepth: number;
  readonly activeSubscriptions: number;
}

export function normalizeRelayCapabilitySnapshot(
  state: RelayRuntimeCapabilityState
): RelayCapabilitySnapshot {
  return {
    url: state.relayUrl,
    maxFilters: state.maxFilters,
    maxSubscriptions: state.maxSubscriptions,
    supportedNips: [...state.supportedNips],
    source: state.source,
    expiresAt: state.expiresAt,
    stale: state.stale,
    queueDepth: state.queueDepth,
    activeSubscriptions: state.activeSubscriptions
  };
}
