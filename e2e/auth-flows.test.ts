import { expect, test } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { setupFullLogin, setupMockPool, simulateLogin } from './helpers/e2e-setup.js';

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);

test.describe('Authenticated flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
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
