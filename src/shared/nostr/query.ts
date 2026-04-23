import { createRuntimeRequestKey } from '@auftakt/timeline';

import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('nostr:query');

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
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('@auftakt/adapter-relay'),
    import('./client.js')
  ]);
  const rxNostr = await getRxNostr();
  const requestKey = createRuntimeRequestKey({
    mode: 'backward',
    filters,
    overlay: options?.overlay,
    scope: 'shared:nostr:query:fetchBackwardEvents'
  });
  const req = createRxBackwardReq({ requestKey });
  const events: TEvent[] = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => settleResolve(), options?.timeoutMs ?? 10_000);
    const useOptions =
      options?.overlay && options.overlay.relays.length > 0
        ? {
            on: {
              relays: options.overlay.relays,
              defaultReadRelays: options.overlay.includeDefaultReadRelays ?? true
            }
          }
        : undefined;

    const sub = rxNostr.use(req, useOptions).subscribe({
      next: (packet) => {
        events.push(packet.event as TEvent);
      },
      complete: () => settleResolve(),
      error: (error) => {
        log.warn('Backward fetch errored', error);
        if (options?.rejectOnError) {
          settleReject(error);
          return;
        }
        settleResolve();
      }
    });

    for (const filter of filters) {
      req.emit(filter as never);
    }
    req.over();

    function settleResolve() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      resolve(events);
    }

    function settleReject(error: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      reject(error);
    }
  });
}

export async function fetchBackwardFirst<TEvent>(
  filters: readonly Filter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  const events = await fetchBackwardEvents<TEvent>(filters, options);
  return events.at(-1) ?? null;
}
