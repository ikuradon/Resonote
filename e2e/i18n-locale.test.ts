/**
 * E2E tests for i18n/locale switching.
 * Covers section 21 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import { TEST_TRACK_URL } from './helpers/e2e-setup.js';

test.describe('Language switching', () => {
  test('should display language switcher on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Language switcher should be visible
    const switcher = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await expect(switcher).toBeVisible({ timeout: 10_000 });
  });

  test('should switch language from English to Japanese', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click language switcher
    const switcher = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await switcher.click();

    // Select Japanese
    const jaOption = page.getByText('日本語').first();
    await expect(jaOption).toBeVisible({ timeout: 5_000 });
    await jaOption.click();

    // Login button should now be in Japanese
    await expect(page.locator('button:has-text("Nostrでログイン")')).toBeVisible({
      timeout: 5_000
    });
  });

  test('should switch language from Japanese to English', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // First switch to Japanese
    const switcher = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await switcher.click();
    await page.getByText('日本語').first().click();
    await expect(page.locator('button:has-text("Nostrでログイン")')).toBeVisible({
      timeout: 5_000
    });

    // Now switch to English
    const switcher2 = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await switcher2.click();
    await page.getByText('English').first().click();

    await expect(page.locator('button:has-text("Login with Nostr")')).toBeVisible({
      timeout: 5_000
    });
  });

  test('should persist language setting after reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Japanese
    const switcher = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await switcher.click();
    await page.getByText('日本語').first().click();
    await expect(page.locator('button:has-text("Nostrでログイン")')).toBeVisible({
      timeout: 5_000
    });

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be Japanese
    await expect(page.locator('button:has-text("Nostrでログイン")')).toBeVisible({
      timeout: 10_000
    });
  });

  test('should apply language to content page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Japanese
    const switcher = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await switcher.click();
    await page.getByText('日本語').first().click();

    // Navigate to content page
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Comments heading should be in Japanese
    await expect(page.locator('text=コメント').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should close language dropdown on click outside', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const switcher = page
      .locator('button')
      .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
      .first();
    await switcher.click();

    await expect(page.getByText('日本語').first()).toBeVisible({ timeout: 5_000 });

    // Click outside (on the page body)
    await page.locator('h1').click();

    // Dropdown should close
    await expect(page.locator('.absolute').filter({ hasText: '日本語' })).toHaveCount(0, {
      timeout: 5_000
    });
  });
});
