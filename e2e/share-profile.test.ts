import { expect, test } from '@playwright/test';
import { npubEncode } from 'nostr-tools/nip19';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { setupFullLogin, setupMockPool, simulateLogin } from './helpers/e2e-setup.js';

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);
const testNpub = npubEncode(testPubkey);

test.describe('Share flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
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
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
  });

  test('should navigate to own profile page', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const profileLink = page.locator('a[href*="/profile/"]').first();
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

    const viewAllLink = page.getByRole('link', { name: /View all|すべて表示/ });
    await expect(viewAllLink).toBeVisible({ timeout: 5_000 });
    await viewAllLink.click();

    await expect(page).toHaveURL(/\/notifications/, { timeout: 10_000 });
  });
});
