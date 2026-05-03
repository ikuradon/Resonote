/**
 * E2E tests for mobile/tablet responsive layouts.
 * Extends responsive.test.ts with additional viewport and interaction tests.
 */
import { expect, test } from '@playwright/test';

import {
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

test.describe('Mobile hamburger menu', () => {
  // Settings/Bookmarks links only appear when logged in
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should open and close hamburger menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const hamburger = page.locator('[data-testid="hamburger-menu-button"]');
    await expect(hamburger).toBeVisible();

    await hamburger.click();

    // Mobile overlay should appear with nav links (logged-in only)
    await expect(page.getByText(/Settings|設定/i).first()).toBeVisible({ timeout: 5_000 });

    // Close via Escape
    await page.keyboard.press('Escape');

    // Settings link should disappear (overlay closed)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });
  });

  test('should navigate from hamburger to settings', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await page.locator('[data-testid="hamburger-menu-button"]').click();

    const settingsLink = page.locator('[role="dialog"] a[href="/settings"]').first();
    await expect(settingsLink).toBeVisible({ timeout: 5_000 });
    await settingsLink.click();

    await expect(page).toHaveURL('/settings', { timeout: 10_000 });
  });

  test('should navigate from hamburger to bookmarks', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await page.locator('[data-testid="hamburger-menu-button"]').click();

    const bookmarksLink = page.locator('[role="dialog"] a[href="/bookmarks"]').first();
    await expect(bookmarksLink).toBeVisible({ timeout: 5_000 });
    await bookmarksLink.click();

    await expect(page).toHaveURL('/bookmarks', { timeout: 10_000 });
  });
});

test.describe('Mobile content page', () => {
  test('should display embed and comments on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(TEST_TRACK_URL);

    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should show login prompt on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(TEST_TRACK_URL);

    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });

  test('should post comment on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Use Shout tab to bypass position requirement
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Mobile comment');
    await page.locator('button[type="submit"]').click();

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
  });

  test('should show share button in Info tab on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    await expect(page.getByRole('button', { name: /Share|共有/i })).toBeVisible({
      timeout: 10_000
    });
  });
});

test.describe('Tablet layout', () => {
  test('should show hamburger menu on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('[data-testid="hamburger-menu-button"]')).toBeVisible();
  });

  test('should display content page on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(TEST_TRACK_URL);
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });
});

test.describe('Desktop layout', () => {
  test('should show full navigation bar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // No hamburger on desktop
    await expect(page.locator('[data-testid="hamburger-menu-button"]')).toHaveCount(0);

    // Full nav visible
    await expect(
      page.locator('button:has-text("Login with Nostr"), button:has-text("Nostrでログイン")')
    ).toBeVisible();
  });
});

test.describe('Mobile settings page', () => {
  test('should display settings sections on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Mute|ミュート/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Developer|開発/ })
        .first()
    ).toBeVisible();
  });
});

test.describe('Mobile notifications page', () => {
  test('should display notifications on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.locator('h1').filter({ hasText: /Notifications|通知/ })).toBeVisible({
      timeout: 10_000
    });
  });
});
