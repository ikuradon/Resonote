/**
 * Relay actions — publish relay list.
 * Encapsulates infra (castSigned, getRxNostr).
 */

import { buildNip51ListEvent } from '@auftakt/core';

import { publishSignedEvent, setPreferredRelays } from '$shared/auftakt/resonote.js';
import { createLogger } from '$shared/utils/logger.js';

import type { RelayEntry } from '../domain/relay-model.js';

const log = createLogger('relay-actions');
const RELAY_LIST_KIND = 10002;

export async function publishRelayList(entries: RelayEntry[]): Promise<string[]> {
  log.info('Publishing relay list', { count: entries.length });

  const tags: string[][] = entries.map((e) => {
    if (e.read && e.write) return ['r', e.url];
    if (e.read) return ['r', e.url, 'read'];
    return ['r', e.url, 'write'];
  });

  await publishSignedEvent(buildNip51ListEvent({ kind: RELAY_LIST_KIND, publicTags: tags }));

  const urls = entries.map((e) => e.url);
  await setPreferredRelays(urls);
  return urls;
}
