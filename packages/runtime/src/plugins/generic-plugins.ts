import type { StoredEvent } from '@auftakt/core';

import type { AuftaktRuntimePlugin } from '../plugin-api.js';

export const RELAY_METRICS_READ_MODEL = 'relayMetrics';
export const RELAY_LIST_FLOW = 'relayListFlow';

export interface RelayMetricsReadModel {
  snapshot(): Array<{ relayUrl: string; score: number }>;
}

export interface RelayListFlow {
  fetchRelayListEvents(
    pubkey: string,
    relayListKind: number,
    followKind: number
  ): Promise<{
    relayListEvents: StoredEvent[];
    followListEvents: StoredEvent[];
  }>;
}

export function createRelayMetricsPlugin(model: RelayMetricsReadModel): AuftaktRuntimePlugin {
  return {
    name: 'relayMetricsPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerReadModel(RELAY_METRICS_READ_MODEL, model);
    }
  };
}

export function createRelayListFlowPlugin(flow: RelayListFlow): AuftaktRuntimePlugin {
  return {
    name: 'relayListFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(RELAY_LIST_FLOW, flow);
    }
  };
}
