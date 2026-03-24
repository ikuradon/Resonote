import { expect, test } from '@playwright/test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import { setupFullLogin, setupMockPool, simulateLogin } from './helpers/e2e-setup.js';

const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
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
