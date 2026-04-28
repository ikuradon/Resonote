/**
 * Mute actions — publish encrypted mute list.
 * Encapsulates castSigned and NIP-44 encryption.
 */

import { buildNip51ListEvent } from '@auftakt/core';

import { publishSignedEvent } from '$shared/auftakt/resonote.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('mute-actions');
const MUTE_KIND = 10000;

export async function publishMuteList(encryptedContent: string): Promise<void> {
  await publishSignedEvent(
    buildNip51ListEvent({ kind: MUTE_KIND, privateContent: encryptedContent })
  );
  log.info('Mute list published');
}
