/**
 * App-level initialization orchestrator.
 * Called once from +layout.svelte onMount.
 * Fire-and-forget to match original onMount behavior.
 */

import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('init-app');

export function initApp(): void {
  log.info('Initializing app');

  import('$shared/browser/auth.js').then(({ initAuth }) => initAuth());
  import('$shared/browser/extension.js').then(({ initExtensionListener }) =>
    initExtensionListener()
  );
  import('$shared/nostr/gateway.js').then(({ retryPendingPublishes }) =>
    retryPendingPublishes().catch(() => {})
  );
}
