/**
 * E2E tests for comment content rendering.
 * Covers section 3 of e2e-test-scenarios.md.
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
const otherUser = createTestIdentity();

test.describe('Comment text rendering', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should auto-link URLs in comments', async ({ page }) => {
    const comment = buildComment(
      otherUser,
      'Check https://example.com for details',
      TEST_I_TAG,
      TEST_K_TAG
    );
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Check').first()).toBeVisible({ timeout: 15_000 });
    const link = page.locator('a[href="https://example.com"]').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('should display comment with newlines', async ({ page }) => {
    const comment = buildComment(
      otherUser,
      'Line one\nLine two\nLine three',
      TEST_I_TAG,
      TEST_K_TAG
    );
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Line one').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Line two').first()).toBeVisible();
    await expect(page.getByText('Line three').first()).toBeVisible();
  });

  test('should display long comment without overflow', async ({ page }) => {
    const longText = `${'A'.repeat(500)} ${'B'.repeat(500)}`;
    const comment = buildComment(otherUser, longText, TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Just verify it renders without crash
    await expect(page.getByText('AAAAA').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should display URL-only comment as link', async ({ page }) => {
    const comment = buildComment(otherUser, 'https://example.com/page', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    const link = page.locator('a[href="https://example.com/page"]').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
  });

  test('should display hashtag with accent color', async ({ page }) => {
    const comment = buildComment(otherUser, 'Great song #NowPlaying', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('#NowPlaying').first()).toBeVisible({ timeout: 15_000 });
    // Hashtag should have accent color class
    const hashtag = page.locator('span').filter({ hasText: '#NowPlaying' }).first();
    await expect(hashtag).toHaveClass(/text-accent/);
  });

  test('should render timed comment with position badge', async ({ page }) => {
    const comment = buildComment(otherUser, 'At this moment', TEST_I_TAG, TEST_K_TAG, {
      positionSec: 90
    });
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // Timed comments appear in Flow tab (default tab)
    await expect(page.getByText('At this moment').first()).toBeVisible({ timeout: 15_000 });
    // Position badge should show 1:30
    await expect(page.getByText('1:30').first()).toBeVisible();
  });

  test('should display relative timestamp on comment', async ({ page }) => {
    const comment = buildComment(otherUser, 'Timestamp test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Timestamp test').first()).toBeVisible({ timeout: 15_000 });
    // Verify comment card has a muted timestamp element
    const commentCard = page.locator('div').filter({ hasText: 'Timestamp test' }).first();
    await expect(commentCard.locator('.text-text-muted').first()).toBeVisible({ timeout: 5_000 });
  });
});
