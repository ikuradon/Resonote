/**
 * E2E tests for timing, concurrent operations, and cross-feature interactions.
 * Covers sections 33, 34, 42 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  buildReaction,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();

test.describe('Concurrent operations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should preserve textarea content when new comments arrive', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Draft in progress');

    // Inject multiple comments rapidly
    const comments = Array.from({ length: 3 }, (_, i) =>
      buildComment(otherUser, `Rapid ${i}`, TEST_I_TAG, TEST_K_TAG)
    );
    await broadcastEventsOnAllRelays(page, comments);

    // Wait for at least one to appear
    await expect(page.getByText('Rapid 0').first()).toBeVisible({ timeout: 15_000 });

    // Draft should be preserved
    await expect(textarea).toHaveValue('Draft in progress');
  });

  test('should handle rapid filter switching', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const allBtn = page.getByRole('button', { name: /^All$|^すべて$/ }).first();
    const followsBtn = page.getByRole('button', { name: /^Follows$|^フォロー$/ }).first();
    const wotBtn = page.getByRole('button', { name: /^WoT$/ }).first();

    await expect(allBtn).toBeVisible({ timeout: 10_000 });

    // Rapid switching
    await followsBtn.click();
    await wotBtn.click();
    await allBtn.click();
    await followsBtn.click();
    await allBtn.click();

    // Should be stable on "All"
    await expect(allBtn).toHaveClass(/shadow-sm/, { timeout: 5_000 });
  });

  test('should handle rapid page navigation', async ({ page }) => {
    await page.goto('/');
    await page.goto(TEST_TRACK_URL);
    await page.goto('/settings');
    await page.goto('/bookmarks');
    await page.goto(TEST_TRACK_URL);

    // Should end on content page
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Cross-feature interactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show comment and allow reaction on it', async ({ page }) => {
    const comment = buildComment(otherUser, 'Cross-feature comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Cross-feature comment').first()).toBeVisible({ timeout: 15_000 });

    // React to it
    const likeButton = page
      .locator('article, div')
      .filter({ hasText: 'Cross-feature comment' })
      .first()
      .getByRole('button', { name: /Like|いいね/i })
      .first();
    await likeButton.click();

    // Toast should appear
    await expect(page.getByText(/Reaction|リアクション/i).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should receive reaction from another user on own comment', async ({ page }) => {
    const comment = buildComment(user, 'My cross-feat comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('My cross-feat comment').first()).toBeVisible({ timeout: 15_000 });

    // Another user reacts
    const reaction = buildReaction(otherUser, comment.id, user.pubkey, TEST_I_TAG);
    await broadcastEventsOnAllRelays(page, [reaction]);

    // Heart count should appear
    const heartCount = page.locator('span.font-mono').filter({ hasText: '1' }).first();
    await expect(heartCount).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate from comment avatar to profile page', async ({ page }) => {
    const comment = buildComment(otherUser, 'Avatar click test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Avatar click test').first()).toBeVisible({ timeout: 15_000 });

    // Click on profile link
    const profileLink = page.locator('a[href*="/profile/"]').first();
    await expect(profileLink).toBeVisible({ timeout: 5_000 });
    await profileLink.click();

    await expect(page).toHaveURL(/\/profile\//, { timeout: 10_000 });
  });

  test('should show share menu and close with Escape', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();

    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');

    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });
  });
});

test.describe('Error recovery', () => {
  test('should recover from WebSocket failure on content page', async ({ page }) => {
    // Block WebSocket initially
    await page.route('wss://**', (route) => route.abort());
    await page.goto(TEST_TRACK_URL);

    // Page should still render without crashing
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should show page even when all relays are down', async ({ page }) => {
    await page.route('wss://**', (route) => route.abort());
    await page.goto(TEST_TRACK_URL);

    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});
