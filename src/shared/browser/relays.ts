// @public — Stable API for route/component/feature consumers
/**
 * Relays state bridge — re-exports for route/component access.
 */
export {
  destroyRelayStatus,
  fetchRelayList,
  getRelays,
  initRelayStatus,
  publishRelayList,
  refreshRelayList,
  type RelayListResult
} from './relays.svelte.js';
export type {
  ConnectionState,
  RelayEntry,
  RelayState
} from '$features/relays/domain/relay-model.js';
export {
  isTransitionalState,
  parseRelayTags,
  relayStateLabelKey,
  shortUrl,
  stateColor
} from '$features/relays/domain/relay-model.js';
export { createRelaySettingsViewModel } from '$features/relays/ui/relay-settings-view-model.svelte.js';
