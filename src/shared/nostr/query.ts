import {
  fetchBackwardEvents as fetchBackwardEventsFromFacade,
  fetchBackwardFirst as fetchBackwardFirstFromFacade
} from '$shared/auftakt/resonote.js';

type Filter = Record<string, unknown>;

export interface RelayReadOverlayOptions {
  readonly relays: string[];
  readonly includeDefaultReadRelays?: boolean;
}

interface FetchBackwardOptions {
  readonly overlay?: RelayReadOverlayOptions;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export async function fetchBackwardEvents<TEvent>(
  filters: readonly Filter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  return fetchBackwardEventsFromFacade<TEvent>(filters, options);
}

export async function fetchBackwardFirst<TEvent>(
  filters: readonly Filter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  return fetchBackwardFirstFromFacade<TEvent>(filters, options);
}
