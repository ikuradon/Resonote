/**
 * @deprecated Use `$shared/auftakt/resonote.js` or feature/application facades instead.
 *
 * RETIREMENT POLICY:
 * This file remains as a compatibility alias over `relays-config.ts` while bootstrap/session
 * orchestration still imports it. Remove it after those callers cut over.
 */
export { applyUserRelays, resetToDefaultRelays } from '$shared/nostr/relays-config.js';
