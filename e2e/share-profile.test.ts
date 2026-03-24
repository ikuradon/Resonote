/**
 * E2E tests for share and profile flows:
 * - Share button visibility
 * - Bookmark button
 * - Profile page navigation
 * - Notification bell
 */
import { expect, type Page, test } from '@playwright/test';
import { npubEncode } from 'nostr-tools/nip19';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import path from 'path';

const APP_RELAYS = [
  'wss://relay.damus.io',
  'wss://yabu.me',
  'wss://nos.lol',
  'wss://relay.nostr.wirednet.jp'
];

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);
const testNpub = npubEncode(testPubkey);

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

test.describe('Share flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page);
  });

  test('should show share button on content page', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/ });
    await expect(shareButton).toBeVisible({ timeout: 10_000 });
  });

  test('should show bookmark button when logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/ });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Profile flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page);
  });

  test('should navigate to own profile page', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Click profile link in header
    const profileLink = page.locator(`a[href*="/profile/"]`).first();
    await expect(profileLink).toBeVisible({ timeout: 10_000 });
    await profileLink.click();

    await expect(page).toHaveURL(new RegExp(`/profile/${testNpub}`), { timeout: 10_000 });
  });

  test('should show notification bell when logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const notifButton = page.getByRole('button', { name: /Notifications|通知/ });
    await expect(notifButton).toBeVisible({ timeout: 10_000 });
  });

  test('should open notification popover and navigate to full page', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const notifButton = page.getByRole('button', { name: /Notifications|通知/ });
    await expect(notifButton).toBeVisible({ timeout: 10_000 });
    await notifButton.click();

    // Popover opens with "View all" link
    const viewAllLink = page.getByRole('link', { name: /View all|すべて表示/ });
    await expect(viewAllLink).toBeVisible({ timeout: 5_000 });
    await viewAllLink.click();

    await expect(page).toHaveURL(/\/notifications/, { timeout: 10_000 });
  });
});
