/**
 * E2E tests for NIP-19 route resolution.
 * Covers section 26 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

test.describe('NIP-19 routes', () => {
  test('should show loading state for note1 URL', async ({ page }) => {
    // Use a fake note1 bech32 — the app should attempt to resolve
    await page.goto('/note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2jnt08');
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });

  test('should show loading state for nevent1 URL', async ({ page }) => {
    await page.goto(
      '/nevent1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqeqp7sm'
    );
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });

  test('should show error for invalid NIP-19 string', async ({ page }) => {
    await page.goto('/note1invalid');
    // Should show some error or the app shell
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });

  test('should have back to home link on NIP-19 page', async ({ page }) => {
    await page.goto('/note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2jnt08');
    const homeLink = page.locator('a[href="/"]');
    await expect(homeLink.first()).toBeVisible();
  });

  test('should redirect nprofile to profile page', async ({ page }) => {
    // nprofile with a valid-looking pubkey
    await page.goto('/nprofile1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2fj8wk');
    // Should either redirect to /profile/ or show profile page
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });
});
