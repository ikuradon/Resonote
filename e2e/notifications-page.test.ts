/**
 * E2E tests for the /notifications page.
 * Covers: filter tabs, empty state, login prompt, Mark all read.
 */
import { expect, test } from '@playwright/test';

import {
  buildComment,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  storeEventsOnAllRelays
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();
const TEST_I_TAG = 'spotify:track:notifications-preview-test';
const TEST_K_TAG = '31137';

test.describe('Notifications page', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display notifications title', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.locator('h1').filter({ hasText: /Notifications|通知/ })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should display filter tabs', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByRole('button', { name: /^All$|^すべて$/ }).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.getByRole('button', { name: /^Replies$|^返信$/ }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Reactions$|^リアクション$/ }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Mentions$|^メンション$/ }).first()
    ).toBeVisible();
  });

  test('should show empty state when no notifications', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText(/No notifications|通知はまだ/).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should switch filter tabs', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const repliesButton = page.getByRole('button', { name: /^Replies$|^返信$/ }).first();
    await expect(repliesButton).toBeVisible({ timeout: 10_000 });
    await repliesButton.click();

    // Active tab should have highlighted style
    await expect(repliesButton).toHaveClass(/shadow-sm/, { timeout: 5_000 });
  });

  test('should activate Reactions filter tab on click', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const reactionsButton = page
      .getByRole('button', { name: /^Reactions$|^リアクション$/ })
      .first();
    await expect(reactionsButton).toBeVisible({ timeout: 10_000 });
    await reactionsButton.click();

    await expect(reactionsButton).toHaveClass(/shadow-sm/, { timeout: 5_000 });
  });

  test('should not show mark-all-read button when no notifications', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText(/No notifications|通知はまだ/).first()).toBeVisible({
      timeout: 10_000
    });

    await expect(page.getByRole('button', { name: /Mark all|すべて既読/i })).toHaveCount(0);
  });

  test('should show reply target preview text in notification item', async ({ page }) => {
    const targetComment = buildComment(user, 'TARGET_PREVIEW_E2E_TEXT', TEST_I_TAG, TEST_K_TAG, {
      createdAt: Math.floor(Date.now() / 1000) - 120
    });
    const reply = buildComment(
      otherUser,
      'Reply that should reference target',
      TEST_I_TAG,
      TEST_K_TAG,
      {
        parentId: targetComment.id,
        parentPubkey: user.pubkey,
        createdAt: Math.floor(Date.now() / 1000) - 60
      }
    );

    await page.goto('/notifications');
    await storeEventsOnAllRelays(page, [targetComment, reply]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('TARGET_PREVIEW_E2E_TEXT').first()).toBeVisible({
      timeout: 15_000
    });
  });
});

test.describe('Notifications page — not logged in', () => {
  test('should show login prompt', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Login to post|ログインして/).first()).toBeVisible({
      timeout: 10_000
    });
  });
});
