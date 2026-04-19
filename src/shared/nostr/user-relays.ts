/**
 * @deprecated Use `$shared/auftakt/resonote.js` or feature/application facades instead.
 *
 * RETIREMENT POLICY:
 * This file remains as a compatibility alias over `relays-config.ts` for transitional imports
 * only. Production callers were moved to `relays-config.ts` and this alias is retire-ready.
 */
export { applyUserRelays, resetToDefaultRelays } from '$shared/nostr/relays-config.js';
