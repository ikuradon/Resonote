/**
 * E2E tests for settings page flows:
 * - Relay list display after login
 * - Relay add/remove
 * - Notification filter change
 * - Mute NIP-44 warning
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

const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);

async function setupMockPool(page: Page) {
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
}

async function setupFullLogin(page: Page) {
  await page.exposeFunction(
    '__nostrSignEvent',
    (event: { kind: number; content: string; tags: string[][]; created_at: number }) =>
      finalizeEvent(event, sk)
  );
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = nostrMock;
    }
  }, testPubkey);
}

async function simulateLogin(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
  });
}

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page);
  });

  test('should display relay section after login', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const relayHeading = page
      .locator('h2')
      .filter({ hasText: /Relays|リレー/ })
      .first();
    await expect(relayHeading).toBeVisible({ timeout: 10_000 });
  });

  test('should show relay loading state', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Should show loading indicator while fetching relay list
    const loadingText = page.getByText(/Loading relay list|リレーリストを読み込み中/).first();
    await expect(loadingText).toBeVisible({ timeout: 10_000 });
  });

  test('should display mute section', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const muteHeading = page
      .locator('h2')
      .filter({ hasText: /Mute|ミュート/ })
      .first();
    await expect(muteHeading).toBeVisible({ timeout: 10_000 });
  });

  test('should display notification filter options', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Notification filter buttons
    const allButton = page.getByRole('button', { name: /^All$|^全員$/ });
    const followsButton = page.getByRole('button', { name: /^Follows$|^フォロー$/ });
    const wotButton = page.getByRole('button', { name: /^WoT$/ });
    await expect(allButton).toBeVisible({ timeout: 10_000 });
    await expect(followsButton).toBeVisible();
    await expect(wotButton).toBeVisible();
  });

  test('should switch notification filter', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const followsButton = page.getByRole('button', { name: /^Follows$|^フォロー$/ });
    await expect(followsButton).toBeVisible({ timeout: 10_000 });
    await followsButton.click();

    // Verify the button becomes active (has accent styling)
    await expect(followsButton).toHaveClass(/shadow-sm/, { timeout: 5_000 });
  });

  test('should display developer tools section', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const devToolsHeading = page
      .locator('h2')
      .filter({ hasText: /Developer|開発/ })
      .first();
    await expect(devToolsHeading).toBeVisible({ timeout: 10_000 });
  });
});
