import { createRxBackwardReq } from '@auftakt/core';
import { fetchBackwardEvents as fetchBackwardEventsHelper } from '@auftakt/resonote/compat-query';

import { getRxNostr } from './client.js';

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
  return fetchBackwardEventsHelper<TEvent>({ getRxNostr, createRxBackwardReq }, filters, options);
}

export async function fetchBackwardFirst<TEvent>(
  filters: readonly Filter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  const events = await fetchBackwardEvents<TEvent>(filters, options);
  return events.at(-1) ?? null;
}
