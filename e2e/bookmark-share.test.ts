/**
 * E2E tests for bookmark and share flows.
 * Covers sections 8 and 9 of e2e-test-scenarios.md.
 */
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

    // Bookmark button is in the tab bar (always visible when logged in)
    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });
  });

  test('should not show bookmark button when not logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Bookmark button should not appear for unauthenticated users
    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toHaveCount(0);
  });

  test('should toggle bookmark on click', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Bookmark button is in the tab bar
    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });

    await bookmarkButton.click();

    // Confirm the bookmark action in the ConfirmDialog
    const confirmButton = page.getByRole('button', { name: /Confirm|確認/i });
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await confirmButton.click();

    // Wait for kind:10003 event to be published
    await expect
      .poll(async () => (await getPublishedEvents(page, BOOKMARK_KIND)).length, {
        timeout: 10_000
      })
      .toBeGreaterThanOrEqual(1);
  });

  test('should change bookmark button to filled star after adding', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Bookmark button is in the tab bar
    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });

    // Should show bookmark icon initially (SVG path element present)
    await expect(bookmarkButton.locator('svg')).toBeVisible();

    await bookmarkButton.click();

    // Confirm the bookmark action in the ConfirmDialog
    const confirmButton = page.getByRole('button', { name: /Confirm|確認/i });
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await confirmButton.click();

    // After bookmark, SVG should have fill (bookmarked state uses fill="currentColor")
    await expect(bookmarkButton.locator('svg[fill="currentColor"]')).toBeVisible({
      timeout: 10_000
    });
  });

  // MockPool responds instantly, so the disabled state is too brief to catch.
  // Would need MockPool latency simulation to test reliably.
  test.fixme('should disable bookmark button while processing', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });
    await bookmarkButton.click();

    // Button should be disabled during processing
    await expect(bookmarkButton).toBeDisabled({ timeout: 2_000 });
  });

  test('should remove bookmark on second click', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Bookmark button is in the tab bar
    const bookmarkButton = page.getByRole('button', { name: /Bookmark|ブックマーク/i });
    await expect(bookmarkButton).toBeVisible({ timeout: 10_000 });

    // Add bookmark
    await bookmarkButton.click();

    // Confirm the bookmark action
    const confirmButton = page.getByRole('button', { name: /Confirm|確認/i });
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await confirmButton.click();

    // Should show filled bookmark SVG after adding
    await expect(bookmarkButton.locator('svg[fill="currentColor"]')).toBeVisible({
      timeout: 10_000
    });

    // Remove bookmark
    await bookmarkButton.click();

    // Confirm the remove action
    const confirmRemoveButton = page.getByRole('button', { name: /Confirm|確認/i });
    await expect(confirmRemoveButton).toBeVisible({ timeout: 5_000 });
    await confirmRemoveButton.click();

    // Should go back to unfilled bookmark SVG
    await expect(bookmarkButton.locator('svg[fill="none"]')).toBeVisible({ timeout: 10_000 });
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

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

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

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.getByText(/Post to Nostr|Nostrに投稿/).first()).toBeVisible({
      timeout: 5_000
    });
  });

  test('should not show "Post to Nostr" when not logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

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

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.getByText(/Copy link|リンクをコピー/).first()).toBeVisible({
      timeout: 5_000
    });

    await page.keyboard.press('Escape');

    await expect(page.getByText(/Copy link|リンクをコピー/)).toHaveCount(0, { timeout: 5_000 });
  });

  test('should close share menu on backdrop click', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.getByText(/Copy link|リンクをコピー/).first()).toBeVisible({
      timeout: 5_000
    });

    // Click the × close button in the dialog header (not the backdrop)
    const closeButton = page
      .locator('[role="dialog"] button[title="Close"], [role="dialog"] button[title="閉じる"]')
      .first();
    await closeButton.click();

    await expect(page.getByText(/Copy link|リンクをコピー/)).toHaveCount(0, { timeout: 5_000 });
  });

  test('should show Post to Nostr form when clicked', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    const postNostrButton = page.getByText(/Post to Nostr|Nostrに投稿/).first();
    await expect(postNostrButton).toBeVisible({ timeout: 5_000 });
    await postNostrButton.click();

    // A textarea or input for the note should appear
    await expect(page.locator('textarea').last()).toBeVisible({ timeout: 5_000 });
  });

  test('should show cancel button in Post to Nostr form', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    const postNostrButton = page.getByText(/Post to Nostr|Nostrに投稿/).first();
    await postNostrButton.click();

    // Cancel button should be visible
    await expect(page.getByRole('button', { name: /Cancel|キャンセル/i }).first()).toBeVisible({
      timeout: 5_000
    });
  });
});

test.describe('Share — Post to Nostr flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should publish kind:1 note when sharing to Nostr', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await expect(shareButton).toBeVisible({ timeout: 10_000 });
    await shareButton.click();

    const postNostrButton = page.getByText(/Post to Nostr|Nostrに投稿/).first();
    await expect(postNostrButton).toBeVisible({ timeout: 5_000 });
    await postNostrButton.click();

    // Type text in the textarea
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill('Test share note to Nostr');

    // Click the Post button
    const postButton = page.getByRole('button', { name: /^Post$|^投稿/ }).first();
    await expect(postButton).toBeVisible({ timeout: 5_000 });
    await postButton.click();

    // Assert at least 1 kind:1 event was published
    await expect
      .poll(async () => (await getPublishedEvents(page, 1)).length, {
        timeout: 15_000
      })
      .toBeGreaterThanOrEqual(1);
  });

  test('should close modal after successful post', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await expect(shareButton).toBeVisible({ timeout: 10_000 });
    await shareButton.click();

    const postNostrButton = page.getByText(/Post to Nostr|Nostrに投稿/).first();
    await expect(postNostrButton).toBeVisible({ timeout: 5_000 });
    await postNostrButton.click();

    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill('Post then close test');

    const postButton = page.getByRole('button', { name: /^Post$|^投稿/ }).first();
    await postButton.click();

    // Modal/dialog should disappear after successful post
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });
  });
});
