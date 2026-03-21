// @public — Stable API for route/component/feature consumers
/**
 * Dev tools bridge — shared entry point for dev-only support helpers.
 */

export {
  loadDbStats,
  clearIndexedDB,
  clearLocalStorage,
  clearAllData,
  checkServiceWorkerStatus,
  checkServiceWorkerUpdate,
  buildDebugInfo,
  type DbStats,
  type DebugInfo
} from './dev-tools.svelte.js';
