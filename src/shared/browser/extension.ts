// @public — Stable API for route/component/feature consumers
/**
 * Extension bridge — re-exports for app/feature access.
 */
export {
  initExtensionListener,
  isExtensionMode,
  detectExtension,
  sendSeekRequest,
  requestOpenContent
} from './extension.svelte.js';
