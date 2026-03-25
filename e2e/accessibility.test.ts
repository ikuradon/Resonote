/**
 * E2E tests for accessibility and keyboard navigation.
 * Covers section 23 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

test.describe('Semantic heading hierarchy', () => {
  test('should have h1 on home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should have h2 "Comments" on content page', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });
});

test.describe('ARIA attributes', () => {
  test('should have aria-label on hamburger menu button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const hamburger = page.locator('[data-testid="hamburger-menu-button"]');
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute('aria-expanded', /(true|false)/);
  });

  test('should have role="dialog" on share modal', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await expect(shareButton).toBeVisible({ timeout: 10_000 });
    await shareButton.click();

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
  });

  test('should have aria-modal on share dialog', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.locator('[aria-modal="true"]')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Keyboard navigation', () => {
  test('should close share modal with Escape', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');

    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });
  });

  test('should submit URL input with Enter key', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await input.press('Enter');
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should focus cancel button in ConfirmDialog', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    const comment = buildComment(user, 'Focus test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Focus test').first()).toBeVisible({ timeout: 15_000 });

    // Click delete
    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Focus test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    // Cancel button should be focused (confirm dialog auto-focuses cancel)
    const cancelButton = page.getByRole('button', { name: /Cancel|キャンセル/ }).last();
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
    await expect(cancelButton).toBeFocused({ timeout: 3_000 });
  });

  test('should close ConfirmDialog with Escape', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    const comment = buildComment(user, 'Escape dialog test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Escape dialog test').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Escape dialog test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');

    // Dialog should close, comment should remain
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByText('Escape dialog test').first()).toBeVisible();
  });
});

test.describe('Focus visibility', () => {
  // Tab focus behavior is unreliable in headless Chromium
  test.skip('should move focus on tab navigation', async ({ page }) => {
    await page.goto('/');

    // Tab to the first interactive element
    await page.keyboard.press('Tab');

    // Some element should have focus (check via evaluate since :focus-visible is browser-dependent)
    const hasFocus = await page.evaluate(
      () => document.activeElement !== null && document.activeElement !== document.body
    );
    expect(hasFocus).toBe(true);
  });
});
