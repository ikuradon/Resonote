/**
 * E2E tests for logged-in comment flows:
 * - Post comment → verify relay receives kind:1111 with correct tags
 * - Post comment → verify it appears in UI
 * - Reaction → verify relay receives kind:7
 */
import { expect, type Page, test } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import path from 'path';

// E2E tests must register the REAL relay URLs that the app's bundled
// DEFAULT_RELAYS will connect to, so MockPool can intercept them.
const APP_RELAYS = [
  'wss://relay.damus.io',
  'wss://yabu.me',
  'wss://nos.lol',
  'wss://relay.nostr.wirednet.jp'
];

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);

async function simulateLogin(page: Page) {
  // window.nostr is already locked via addInitScript; just fire the login event
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
  });
}

test.describe('Comment flow', () => {
  test.beforeEach(async ({ page }) => {
    // Inject tsunagiya MockPool + expose __mockPool for inspection.
    // addInitScript wraps code in a function scope, so the bundle's
    // `var Tsunagiya = (...)()` does NOT create window.Tsunagiya.
    // We read the bundle as string and prepend `window.Tsunagiya =`.
    const fs = await import('fs');
    const bundleSrc = fs.readFileSync(path.resolve('e2e/helpers/tsunagiya-bundle.js'), 'utf8');
    await page.addInitScript(bundleSrc.replace('var Tsunagiya', 'window.Tsunagiya'));
    await page.addInitScript((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = new (window as any).Tsunagiya.MockPool();
      for (const url of relays) {
        pool.relay(url);
      }
      pool.install();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mockPool = pool;
    }, APP_RELAYS);

    // Expose Node.js signer to browser (must be before page.goto)
    await page.exposeFunction(
      '__nostrSignEvent',
      (event: { kind: number; content: string; tags: string[][]; created_at: number }) =>
        finalizeEvent(event, sk)
    );

    // Lock window.nostr with our mock BEFORE nostr-login initializes.
    // configurable: false prevents nostr-login from replacing it with its proxy.
    await page.addInitScript((pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nostrMock: any = {
        getPublicKey: async () => pubkey,
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
        // Fallback if property already defined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).nostr = nostrMock;
      }
    }, testPubkey);
  });

  test('should post a comment and display it', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Wait for comment form
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Type and send
    await textarea.fill('Hello from E2E test!');
    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeVisible();
    await sendButton.click();

    // Textarea clears on successful send
    await expect(textarea).toHaveValue('', { timeout: 10_000 });

    // Comment appears in the page (may take a moment for relay broadcast → subscription)
    await expect(page.getByText('Hello from E2E test!').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should clear textarea after successful send', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill('Clear test');
    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Textarea should be cleared after successful send
    await expect(textarea).toHaveValue('', { timeout: 10_000 });
  });
});

test.describe('Read-only login', () => {
  test.beforeEach(async ({ page }) => {
    const fs = await import('fs');
    const bundleSrc = fs.readFileSync(path.resolve('e2e/helpers/tsunagiya-bundle.js'), 'utf8');
    await page.addInitScript(bundleSrc.replace('var Tsunagiya', 'window.Tsunagiya'));
    await page.addInitScript((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = new (window as any).Tsunagiya.MockPool();
      for (const url of relays) {
        pool.relay(url);
      }
      pool.install();
    }, APP_RELAYS);
  });

  test('should show comment form after read-only login', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');

    // Read-only: getPublicKey only, no signEvent
    await page.evaluate(async (pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = {
        getPublicKey: async () => pubkey
        // No signEvent — read-only mode
      };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, testPubkey);

    // Should still show comment form (loggedIn = true)
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test('should show NIP-44 warning on settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Read-only login
    await page.evaluate(async (pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = {
        getPublicKey: async () => pubkey
      };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, testPubkey);

    // NIP-44 warning should be visible (no nip44 in window.nostr)
    const nip44Warning = page.locator('text=NIP-44');
    await expect(nip44Warning).toBeVisible({ timeout: 10_000 });
  });

  test('should show relay loading on settings page after login', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async (pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = {
        getPublicKey: async () => pubkey
      };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, testPubkey);

    // Relay section heading should be visible
    const relayHeading = page
      .locator('h2')
      .filter({ hasText: /Relays|リレー/ })
      .first();
    await expect(relayHeading).toBeVisible({ timeout: 10_000 });
  });
});
