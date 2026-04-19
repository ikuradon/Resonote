/**
 * E2E tests for data volume scenarios.
 * Covers section 32 of e2e-test-scenarios.md.
 */
import { finalizeEvent } from '@auftakt/core';
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  COMMENT_KIND,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

test.describe('Data volume — comments', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show empty state with 0 comments', async ({ page }) => {
    // MockPool is installed via setupMockPool (addInitScript) BEFORE page.goto(),
    // so all WebSocket connections opened during page load hit the mock.
    // No events are stored → 0 comments guaranteed regardless of test order.
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Switch to Shout tab to see general comment empty state
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText(/No comments|コメントはまだ/).first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should display single comment correctly', async ({ page }) => {
    const comment = buildComment(user, 'Solo comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Solo comment').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should handle 50 comments', async ({ page }) => {
    test.setTimeout(60_000);
    const identity = createTestIdentity();
    const now = Math.floor(Date.now() / 1000);
    const comments = Array.from({ length: 50 }, (_, i) =>
      finalizeEvent(
        {
          kind: COMMENT_KIND,
          content: `Batch comment ${i}`,
          tags: [
            ['I', TEST_I_TAG],
            ['K', TEST_K_TAG]
          ],
          created_at: now - 50 + i
        },
        identity.sk
      )
    );

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, comments);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Latest comment should be visible (allow extra time in slow CI)
    await expect(page.getByText('Batch comment 49').first()).toBeVisible({ timeout: 30_000 });

    // Shout tab button shows count as "(50)" next to the tab icon
    // The tab button contains "(50)" or similar count indicator
    await expect(
      page.locator('button').filter({ hasText: /📢/ }).filter({ hasText: '50' }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('should handle mixed timed and general comments', async ({ page }) => {
    const identity = createTestIdentity();
    const now = Math.floor(Date.now() / 1000);
    const timed = Array.from({ length: 10 }, (_, i) =>
      finalizeEvent(
        {
          kind: COMMENT_KIND,
          content: `Timed ${i}`,
          tags: [
            ['I', TEST_I_TAG],
            ['K', TEST_K_TAG],
            ['position', String(i * 15)]
          ],
          created_at: now - 20 + i
        },
        identity.sk
      )
    );
    const general = Array.from({ length: 10 }, (_, i) =>
      finalizeEvent(
        {
          kind: COMMENT_KIND,
          content: `General ${i}`,
          tags: [
            ['I', TEST_I_TAG],
            ['K', TEST_K_TAG]
          ],
          created_at: now + i
        },
        createTestIdentity().sk
      )
    );

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [...timed, ...general]);

    // Timed comments appear in Flow tab (default) — tab button shows count
    await expect(
      page.locator('button').filter({ hasText: /🎶/ }).filter({ hasText: '10' }).first()
    ).toBeVisible({ timeout: 20_000 });

    // Switch to Shout tab — general comments should appear there
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Shout tab shows count of general comments
    await expect(
      page.locator('button').filter({ hasText: /📢/ }).filter({ hasText: '10' }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Data volume — pages', () => {
  test('should show empty state on notifications with 0 items', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText(/No notifications|通知はまだ/).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show empty state on bookmarks with 0 items', async ({ page }) => {
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
