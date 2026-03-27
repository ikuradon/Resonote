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
const otherUser = createTestIdentity();

test.describe('Content warning (CW)', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display CW comment as hidden with Show button', async ({ page }) => {
    const cwComment = buildComment(otherUser, 'Spoiler content here', TEST_I_TAG, TEST_K_TAG, {
      cwReason: 'spoiler'
    });
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [cwComment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('spoiler').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Show|表示/i }).first()).toBeVisible();
    await expect(page.getByText('Spoiler content here')).toHaveCount(0);
  });

  test('should reveal CW content on Show click', async ({ page }) => {
    const cwComment = buildComment(otherUser, 'Hidden content revealed', TEST_I_TAG, TEST_K_TAG, {
      cwReason: 'nsfw'
    });
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [cwComment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('nsfw').first()).toBeVisible({ timeout: 15_000 });

    const showButton = page.getByRole('button', { name: /Show|表示/i }).first();
    await showButton.click();

    await expect(page.getByText('Hidden content revealed').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should hide CW content on Hide click', async ({ page }) => {
    const cwComment = buildComment(otherUser, 'Toggle content', TEST_I_TAG, TEST_K_TAG, {
      cwReason: 'test'
    });
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [cwComment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('test').first()).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /Show|表示/i })
      .first()
      .click();
    await expect(page.getByText('Toggle content').first()).toBeVisible({ timeout: 5_000 });

    await page
      .getByText(/Hide|非表示/i)
      .first()
      .click();

    await expect(page.getByText('Toggle content')).toHaveCount(0, { timeout: 5_000 });
  });

  test('should display CW comment with empty reason', async ({ page }) => {
    const cwComment = buildComment(otherUser, 'CW no reason', TEST_I_TAG, TEST_K_TAG, {
      cwReason: ''
    });
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [cwComment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByRole('button', { name: /Show|表示/i }).first()).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByText('CW no reason')).toHaveCount(0);
  });

  test('should display non-CW comments normally', async ({ page }) => {
    const normalComment = buildComment(otherUser, 'Normal visible comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [normalComment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Normal visible comment').first()).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByRole('button', { name: /Show|表示/i })).toHaveCount(0);
  });
});
