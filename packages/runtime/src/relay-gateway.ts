import {
  decodeNegentropyIdListMessage,
  encodeNegentropyIdListMessage
} from './negentropy-message.js';

export type RelayGatewayStrategy = 'negentropy' | 'fallback-req';

export interface RelayGatewayNegentropyResult {
  readonly capability: 'supported' | 'unsupported' | 'failed';
  readonly messageHex?: string;
  readonly reason?: string;
}

export interface RelayGatewayCandidate {
  readonly event: unknown;
  readonly relayUrl: string;
}

export interface RelayGatewayResult {
  readonly strategy: RelayGatewayStrategy;
  readonly candidates: readonly RelayGatewayCandidate[];
}

export function createRelayGateway(deps: {
  requestNegentropySync(input: {
    readonly relayUrl: string;
    readonly filter: Record<string, unknown>;
    readonly initialMessageHex: string;
  }): Promise<RelayGatewayNegentropyResult>;
  fetchByReq(
    filters: readonly Record<string, unknown>[],
    options: { readonly relayUrl: string }
  ): Promise<readonly unknown[]>;
  listLocalRefs(
    filters: readonly Record<string, unknown>[]
  ): Promise<readonly { readonly id: string; readonly created_at: number }[]>;
}) {
  return {
    async verify(
      filters: readonly Record<string, unknown>[],
      options: { readonly relayUrl: string }
    ): Promise<RelayGatewayResult> {
      if (filters.length > 1) {
        const events = await deps.fetchByReq(filters, options);
        return { strategy: 'fallback-req', candidates: toCandidates(events, options.relayUrl) };
      }

      let localRefs: readonly { readonly id: string; readonly created_at: number }[];
      try {
        localRefs = await deps.listLocalRefs(filters);
      } catch {
        const events = await deps.fetchByReq(filters, options);
        return { strategy: 'fallback-req', candidates: toCandidates(events, options.relayUrl) };
      }
      const negentropy = await deps.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter: filters[0] ?? {},
        initialMessageHex: encodeNegentropyIdListMessage(localRefs)
      });

      if (negentropy.capability !== 'supported') {
        const events = await deps.fetchByReq(filters, options);
        return { strategy: 'fallback-req', candidates: toCandidates(events, options.relayUrl) };
      }

      const remoteOnlyIds = parseRemoteOnlyIds(negentropy.messageHex, localRefs);
      if (remoteOnlyIds.length > 0) {
        const events = await deps.fetchByReq([{ ids: remoteOnlyIds }], options);
        return { strategy: 'negentropy', candidates: toCandidates(events, options.relayUrl) };
      }

      return { strategy: 'negentropy', candidates: [] };
    }
  };
}

function toCandidates(
  events: readonly unknown[],
  relayUrl: string
): readonly RelayGatewayCandidate[] {
  return events.map((event) => ({ event, relayUrl }));
}

function parseRemoteOnlyIds(
  messageHex: string | undefined,
  localRefs: readonly { readonly id: string }[]
): string[] {
  if (!messageHex) return [];
  try {
    const localIds = new Set(localRefs.map((event) => event.id));
    return decodeNegentropyIdListMessage(messageHex).filter((id) => !localIds.has(id));
  } catch {
    return [];
  }
}
