/**
 * Relay actions — publish relay list.
 * Encapsulates infra (castSigned, getRxNostr).
 */

import { createLogger } from '$shared/utils/logger.js';

import type { RelayEntry } from '../domain/relay-model.js';

const log = createLogger('relay-actions');
const RELAY_LIST_KIND = 10002;

export async function publishRelayList(entries: RelayEntry[]): Promise<string[]> {
  log.info('Publishing relay list', { count: entries.length });
  const { castSigned, getRxNostr } = await import('$shared/nostr/gateway.js');

  const tags: string[][] = entries.map((e) => {
    if (e.read && e.write) return ['r', e.url];
    if (e.read) return ['r', e.url, 'read'];
    return ['r', e.url, 'write'];
  });

  await castSigned({ kind: RELAY_LIST_KIND, content: '', tags });

  const rxNostr = await getRxNostr();
  const urls = entries.map((e) => e.url);
  rxNostr.setDefaultRelays(urls);
  return urls;
}
