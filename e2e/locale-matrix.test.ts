/**
 * E2E tests for locale matrix — verify key pages in both English and Japanese.
 * Covers section 38 of e2e-test-scenarios.md.
 */
import { expect, type Page, test } from '@playwright/test';

import {
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

async function switchToJapanese(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const switcher = page
    .locator('button')
    .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
    .first();
  await switcher.click();
  await page.getByText('日本語').first().click();
  await page.waitForTimeout(500);
}

async function switchToEnglish(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const switcher = page
    .locator('button')
    .filter({ hasText: /🇺🇸|🇯🇵|EN|JA/ })
    .first();
  await switcher.click();
  await page.getByText('English').first().click();
  await page.waitForTimeout(500);
}

test.describe('Locale matrix — English', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('should show English home page text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await switchToEnglish(page);

    await expect(page.locator('h1')).toHaveText('Resonote');
    await expect(page.locator('button:has-text("Login with Nostr")')).toBeVisible();
  });

  test('should show English Comments heading', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await switchToEnglish(page);

    await expect(page.locator('h2:has-text("Comments")')).toBeVisible({ timeout: 10_000 });
  });

  test('should show English login prompt', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await switchToEnglish(page);

    await expect(page.getByText('Login to post comments').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show English settings headings', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await switchToEnglish(page);

    await expect(page.locator('h2').filter({ hasText: 'Mute' }).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.locator('h2').filter({ hasText: 'Developer' }).first()).toBeVisible();
  });

  test('should show English notification filters', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await switchToEnglish(page);

    await expect(page.locator('h1').filter({ hasText: 'Notifications' })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show English share menu', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await switchToEnglish(page);

    await page.getByRole('button', { name: /Share/i }).click();
    await expect(page.getByText('Copy link').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should show English empty bookmarks', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/bookmarks');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await switchToEnglish(page);

    await expect(page.getByText('No bookmarks yet').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Locale matrix — Japanese', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('should show Japanese home page text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await switchToJapanese(page);

    await expect(page.locator('h1')).toHaveText('Resonote');
    await expect(page.locator('button:has-text("Nostrでログイン")')).toBeVisible();
  });

  test('should show Japanese Comments heading', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await switchToJapanese(page);

    await expect(page.locator('text=コメント').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show Japanese settings headings', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await switchToJapanese(page);

    await expect(page.locator('h2').filter({ hasText: 'ミュート' }).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show Japanese share menu', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await switchToJapanese(page);

    await page.getByRole('button', { name: /共有/i }).click();
    await expect(page.getByText('リンクをコピー').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should show Japanese notification title', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await switchToJapanese(page);

    await expect(page.locator('h1').filter({ hasText: '通知' })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show Japanese empty bookmarks', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/bookmarks');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await switchToJapanese(page);

    await expect(page.getByText('ブックマークはまだありません').first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show Japanese filter bar', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await switchToJapanese(page);

    await expect(page.getByRole('button', { name: 'すべて' }).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.getByRole('button', { name: 'フォロー' }).first()).toBeVisible();
  });
});
