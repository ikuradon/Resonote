import type {
  RelayConnectionState,
  RelayObservation,
  RelayObservationPacket,
  RelayObservationReason,
  RelayObservationSnapshot,
  SessionObservation
} from '@auftakt/core';

export type {
  RelayObservation,
  RelayObservationPacket,
  RelayObservationRuntime,
  RelayObservationSnapshot
} from '@auftakt/core';

export function normalizeRelayObservation(
  url: string,
  connection: RelayConnectionState,
  reason: RelayObservationReason
): RelayObservation {
  return {
    url,
    connection,
    replaying: connection === 'replaying',
    degraded: connection === 'degraded' || connection === 'backoff' || connection === 'closed',
    reason
  };
}

export function normalizeRelayObservationPacket(packet: {
  readonly from: string;
  readonly state: RelayConnectionState;
  readonly reason: RelayObservationReason;
  readonly aggregate: SessionObservation;
}): RelayObservationPacket {
  return {
    ...packet,
    relay: normalizeRelayObservation(packet.from, packet.state, packet.reason)
  };
}

export function normalizeRelayObservationSnapshot(snapshot: {
  readonly url: string;
  readonly connection: RelayConnectionState;
  readonly reason: RelayObservationReason;
  readonly aggregate: SessionObservation;
}): RelayObservationSnapshot {
  return {
    url: snapshot.url,
    relay: normalizeRelayObservation(snapshot.url, snapshot.connection, snapshot.reason),
    aggregate: snapshot.aggregate
  };
}
