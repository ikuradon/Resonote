// @public — Stable API for route/component/feature consumers
/**
 * Relays state bridge — re-exports for route/component access.
 */
export {
  getRelays,
  publishRelayList,
  refreshRelayList,
  initRelayStatus,
  destroyRelayStatus,
  fetchRelayList,
  type RelayListResult
} from './relays.svelte.js';
export type { RelayEntry, ConnectionState, RelayState } from '../../features/relays/domain/relay-model.js';
export {
  parseRelayTags,
  shortUrl,
  stateColor,
  isTransitionalState,
  relayStateLabelKey
} from '../../features/relays/domain/relay-model.js';
export { createRelaySettingsViewModel } from '../../features/relays/ui/relay-settings-view-model.svelte.js';
