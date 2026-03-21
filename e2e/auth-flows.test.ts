import { test, expect } from '@playwright/test';
import path from 'path';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { DEFAULT_RELAYS } from '../src/shared/nostr/relays.js';

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';

// Generate a test keypair for each test run
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);

/**
 * Set up window.nostr mock and fire nlAuth login event.
 */
async function simulateLogin(page: import('@playwright/test').Page) {
  await page.evaluate(async (pubkey: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).nostr = {
      getPublicKey: async () => pubkey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signEvent: async (e: any) => (window as any).__nostrSignEvent(e)
    };
    document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
  }, testPubkey);
}

test.describe('Authenticated flows', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Inject tsunagiya to mock WebSocket
    await page.addInitScript({
      path: path.resolve('e2e/helpers/tsunagiya-bundle.js')
    });
    await page.addInitScript((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = new (window as any).Tsunagiya.MockPool();
      for (const url of relays) {
        pool.relay(url);
      }
      pool.install();
    }, DEFAULT_RELAYS);

    // 2. Expose signEvent bridge (Node.js → browser) for all tests
    await page.exposeFunction(
      '__nostrSignEvent',
      (event: { kind: number; content: string; tags: string[][]; created_at: number }) =>
        finalizeEvent(event, sk)
    );
  });

  test('should show comment form after login', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test('should show send button when text is entered', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Test comment');

    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeVisible();
  });

  test('should show logout button when logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("ログアウト")');
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });
  });

  test('should logout and show login prompt', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("ログアウト")');
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'logout' } }));
    });

    await expect(
      page.locator('button:has-text("Login with Nostr"), button:has-text("Nostrでログイン")')
    ).toBeVisible({ timeout: 10_000 });
  });
});
