// @public — Stable API for route/component/feature consumers
/**
 * Dev tools bridge — shared entry point for dev-only support helpers.
 */

export {
  buildDebugInfo,
  checkServiceWorkerStatus,
  checkServiceWorkerUpdate,
  clearAllData,
  clearIndexedDB,
  clearLocalStorage,
  type DbStats,
  type DebugInfo,
  loadDbStats
} from './dev-tools.svelte.js';
