/**
 * WoT fetcher — encapsulates relay subscription for follows + 2-hop WoT.
 */

import { fetchWot as fetchWotViaAuftakt } from '$shared/auftakt/resonote.js';
import { createLogger } from '$shared/utils/logger.js';

import { extractFollows } from '../domain/follow-model.js';

const log = createLogger('wot-fetcher');
const FOLLOW_KIND = 3;
const BATCH_SIZE = 100;

export interface WotResult {
  directFollows: Set<string>;
  wot: Set<string>;
}

export interface WotProgressCallback {
  onDirectFollows: (follows: Set<string>) => void;
  onWotProgress: (count: number) => void;
  isCancelled: () => boolean;
}

export async function fetchWot(pubkey: string, callbacks: WotProgressCallback): Promise<WotResult> {
  const result = await fetchWotViaAuftakt(
    pubkey,
    callbacks,
    extractFollows,
    FOLLOW_KIND,
    BATCH_SIZE
  );
  log.info('WoT loaded', {
    directCount: result.directFollows.size,
    totalCount: result.wot.size
  });
  return result;
}
