import { expect, test } from '@playwright/test';

import {
  BOOKMARK_KIND,
  createTestIdentity,
  getPublishedEvents,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

test.describe('Bookmark flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show bookmark button when logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });
  });

  test('should not show bookmark button when not logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toHaveCount(0);
  });

  test('should toggle bookmark on click', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });

    await bookmarkButton.click();

    // Wait for kind:10003 event to be published
    await expect
      .poll(async () => (await getPublishedEvents(page, BOOKMARK_KIND)).length, {
        timeout: 10_000
      })
      .toBeGreaterThanOrEqual(1);
  });
});

test.describe('Bookmarks page', () => {
  test('should show login prompt when not logged in', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/bookmarks');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Login to post|ログインして/).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show empty state when logged in with no bookmarks', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/bookmarks');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText(/No bookmarks|ブックマークはまだ/).first()).toBeVisible({
      timeout: 10_000
    });
  });
});

test.describe('Share flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should open share menu with copy link option', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await expect(shareButton).toBeVisible({ timeout: 10_000 });
    await shareButton.click();

    await expect(page.getByText(/Copy link|リンクをコピー/).first()).toBeVisible({
      timeout: 5_000
    });
  });

  test('should show "Post to Nostr" only when logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.getByText(/Post to Nostr|Nostrに投稿/).first()).toBeVisible({
      timeout: 5_000
    });
  });

  test('should not show "Post to Nostr" when not logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.getByText(/Copy link|リンクをコピー/).first()).toBeVisible({
      timeout: 5_000
    });
    await expect(page.getByText(/Post to Nostr|Nostrに投稿/)).toHaveCount(0);
  });

  test('should close share menu with Escape', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.getByText(/Copy link|リンクをコピー/).first()).toBeVisible({
      timeout: 5_000
    });

    await page.keyboard.press('Escape');

    await expect(page.getByText(/Copy link|リンクをコピー/)).toHaveCount(0, { timeout: 5_000 });
  });
});
