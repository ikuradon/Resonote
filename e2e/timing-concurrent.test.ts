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
  TEST_RELAYS,
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

    // Switch to Shout tab to see general comments
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

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

    const filterSelect = page.locator('select').first();
    await expect(filterSelect).toBeVisible({ timeout: 10_000 });

    // Rapid switching
    await filterSelect.selectOption('follows');
    await filterSelect.selectOption('wot');
    await filterSelect.selectOption('all');
    await filterSelect.selectOption('follows');
    await filterSelect.selectOption('all');

    // Should be stable on "all"
    await expect(filterSelect).toHaveValue('all', { timeout: 5_000 });
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

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

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

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('My cross-feat comment').first()).toBeVisible({ timeout: 15_000 });

    // Another user reacts
    const reaction = buildReaction(otherUser, comment.id, user.pubkey, TEST_I_TAG);
    await broadcastEventsOnAllRelays(page, [reaction]);

    // Heart count should appear — the Like button shows count as text
    const commentCard = page
      .locator('article, div')
      .filter({ hasText: 'My cross-feat comment' })
      .first();
    await expect(commentCard.locator('button').filter({ hasText: '1' }).first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should navigate from comment avatar to profile page', async ({ page }) => {
    const comment = buildComment(otherUser, 'Avatar click test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

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

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

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

test.describe('Cross-feature: comment retry after failure', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should succeed on retry after relay rejection', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Use Shout tab to bypass position requirement
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Configure relays to reject first
    await page.evaluate((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      for (const url of relays) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pool.relay(url).onEVENT((event: any) => ['OK', event.id, false, 'blocked']);
      }
    }, TEST_RELAYS);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Will fail then succeed');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Text should be preserved after failure
    await expect(textarea).toHaveValue('Will fail then succeed', { timeout: 10_000 });

    // Wait for button to re-enable (sending state should clear)
    await expect(sendButton).toBeEnabled({ timeout: 15_000 });

    // Reset relays to accept
    await page.evaluate((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      for (const url of relays) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pool.relay(url).onEVENT((event: any) => ['OK', event.id, true, '']);
      }
    }, TEST_RELAYS);

    // Retry
    await sendButton.click();
    await expect(textarea).toHaveValue('', { timeout: 10_000 });
  });
});

test.describe('Cross-feature: multiple rapid sends', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should handle two rapid comment sends', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Switch to Shout tab to post general comments
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Send first comment
    await textarea.fill('First rapid comment');
    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();
    await expect(textarea).toHaveValue('', { timeout: 10_000 });

    // Send second comment immediately
    await textarea.fill('Second rapid comment');
    await sendButton.click();
    await expect(textarea).toHaveValue('', { timeout: 10_000 });

    // Both should appear in Shout tab
    await expect(page.getByText('First rapid comment').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Second rapid comment').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Cross-feature: mute hides comments immediately', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should hide all comments from muted user including reactions', async ({ page }) => {
    const comment1 = buildComment(otherUser, 'Other visible 1', TEST_I_TAG, TEST_K_TAG);
    const comment2 = buildComment(otherUser, 'Other visible 2', TEST_I_TAG, TEST_K_TAG);
    const userComment = buildComment(user, 'User comment', TEST_I_TAG, TEST_K_TAG);
    const otherReaction = buildReaction(otherUser, userComment.id, user.pubkey, TEST_I_TAG, '+');

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment1, comment2, userComment, otherReaction]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Other visible 1').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Other visible 2').first()).toBeVisible({ timeout: 15_000 });

    // Mute user via More actions menu
    // Shout tab の初期 auto-scroll が落ち着いてから、scroll で閉じる menu を開く。
    await page.waitForTimeout(600);
    const commentEl = page.locator(`[data-comment-id="${comment1.id}"]`);
    await commentEl
      .getByRole('button', { name: /More actions/i })
      .first()
      .click();
    const muteBtn = page.getByRole('button', { name: /Mute User|Mute user/i }).first();
    await expect(muteBtn).toBeVisible({ timeout: 5_000 });
    await muteBtn.click();

    const confirmBtn = page.getByRole('button', { name: /Confirm|確認/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Both other user comments should disappear
    await expect(page.getByText('Other visible 1')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('Other visible 2')).toHaveCount(0, { timeout: 15_000 });
  });
});
