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
        initialMessageHex: JSON.stringify(localRefs)
      });

      if (negentropy.capability !== 'supported') {
        const events = await deps.fetchByReq(filters, options);
        return { strategy: 'fallback-req', candidates: toCandidates(events, options.relayUrl) };
      }

      const remoteOnlyIds = parseRemoteOnlyIds(negentropy.messageHex);
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

function parseRemoteOnlyIds(messageHex: string | undefined): string[] {
  if (!messageHex) return [];
  try {
    const parsed = JSON.parse(messageHex) as { remoteOnlyIds?: unknown };
    return Array.isArray(parsed.remoteOnlyIds)
      ? parsed.remoteOnlyIds.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}
