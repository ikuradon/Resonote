/**
 * Shared E2E test setup helpers.
 *
 * Centralizes tsunagiya MockPool injection, window.nostr mock,
 * and login simulation to avoid duplication across test files.
 */
import type { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { TEST_RELAYS } from './test-relays.js';

// Read and patch the tsunagiya bundle ONCE at module load.
// Playwright's addInitScript wraps code in a function scope,
// so `var Tsunagiya = (...)()` does NOT create window.Tsunagiya.
// We replace `var Tsunagiya` with `window.Tsunagiya` to hoist it.
const bundleSrc = fs.readFileSync(path.resolve('e2e/helpers/tsunagiya-bundle.js'), 'utf8');
const patchedBundle = bundleSrc.replace('var Tsunagiya', 'window.Tsunagiya');
if (patchedBundle === bundleSrc) {
  throw new Error(
    'Failed to patch tsunagiya bundle: "var Tsunagiya" not found. ' +
      'The bundle format may have changed — update the replace pattern.'
  );
}

/**
 * Inject tsunagiya MockPool into the browser context.
 * Must be called before page.goto().
 */
export async function setupMockPool(page: Page): Promise<void> {
  await page.addInitScript(patchedBundle);
  await page.addInitScript((relays: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = new (window as any).Tsunagiya.MockPool();
    for (const url of relays) {
      pool.relay(url);
    }
    pool.install();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mockPool = pool;
  }, TEST_RELAYS);
}

/**
 * Set up full login with NIP-07 signer.
 * Locks window.nostr with configurable:false to prevent nostr-login proxy.
 * Must be called before page.goto().
 */
export async function setupFullLogin(
  page: Page,
  pubkey: string,
  signEvent: (event: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }) => ReturnType<typeof import('nostr-tools/pure').finalizeEvent>
): Promise<void> {
  await page.exposeFunction('__nostrSignEvent', signEvent);
  await page.addInitScript((pk: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nostrMock: any = {
      getPublicKey: async () => pk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signEvent: async (e: any) => (window as any).__nostrSignEvent(e)
    };
    try {
      Object.defineProperty(window, 'nostr', {
        value: nostrMock,
        writable: false,
        configurable: false
      });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = nostrMock;
    }
  }, pubkey);
}

/**
 * Fire nlAuth login event. Call after page.goto() + waitForLoadState().
 */
export async function simulateLogin(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
  });
}
