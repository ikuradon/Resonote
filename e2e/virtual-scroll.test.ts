/**
 * E2E tests for VirtualScrollList behavior and #153/#154.
 * Covers section 25 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';
import { finalizeEvent } from 'nostr-tools/pure';

import {
  broadcastEventsOnAllRelays,
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

function buildManyComments(count: number, timed: boolean) {
  const identity = createTestIdentity();
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => {
    const tags: string[][] = [
      ['I', TEST_I_TAG],
      ['K', TEST_K_TAG]
    ];
    if (timed) {
      tags.push(['position', String(i * 10)]);
    }
    return finalizeEvent(
      {
        kind: COMMENT_KIND,
        content: `Comment #${i + 1}`,
        tags,
        created_at: now - count + i
      },
      identity.sk
    );
  });
}

test.describe('Shout tab — chat-style scroll-to-bottom', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should scroll to bottom (newest comment) when switching to Shout tab', async ({ page }) => {
    const comments = buildManyComments(25, false);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, comments);

    // Switch to Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // The newest comment (#25, at the bottom of chat-style TL) should be visible
    // This also serves as a "comments loaded + scrolled" signal
    await expect(page.getByText('Comment #25', { exact: true }).first()).toBeVisible({
      timeout: 20_000
    });

    // The oldest comment (#1, at the top) should be scrolled out of view
    const scrollContainer = page.locator('.overflow-y-auto').last();
    const scrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);

    // Comment #1 should NOT be visible (it's scrolled away at the top)
    await expect(page.getByText('Comment #1', { exact: true }).first()).not.toBeVisible();
  });

  test('should preserve scroll position when switching tabs and returning', async ({ page }) => {
    const comments = buildManyComments(25, false);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, comments);

    // Switch to Shout tab — auto-scrolls to bottom
    await page.locator('button').filter({ hasText: /📢/ }).first().click();
    await expect(page.getByText('Comment #25').first()).toBeVisible({ timeout: 20_000 });

    // Scroll up to see older comments
    const scrollContainer = page.locator('.overflow-y-auto').last();
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(500);

    // Comment #1 (oldest) should now be visible
    await expect(page.getByText('Comment #1', { exact: true }).first()).toBeVisible({
      timeout: 5_000
    });

    // Switch to Flow tab
    await page.locator('button').filter({ hasText: /🎶/ }).first().click();
    await page.waitForTimeout(300);

    // Switch back to Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();
    await page.waitForTimeout(300);

    // Scroll position should be preserved — Comment #1 should still be visible
    await expect(page.getByText('Comment #1', { exact: true }).first()).toBeVisible({
      timeout: 5_000
    });

    // Comment #25 should NOT be visible (we scrolled away from bottom)
    await expect(page.getByText('Comment #25', { exact: true }).first()).not.toBeVisible();
  });
});

test.describe('VirtualScrollList — general comments (#153)', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display 20+ general comments and allow scrolling', async ({ page }) => {
    const comments = buildManyComments(25, false);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, comments);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Wait for newest comment to be visible (scroll to bottom is auto)
    await expect(page.getByText('Comment #25').first()).toBeVisible({ timeout: 20_000 });

    // Shout tab button shows count "(25)"
    await expect(
      page.locator('button').filter({ hasText: /📢/ }).filter({ hasText: '25' }).first()
    ).toBeVisible();

    // Scroll to top to see oldest comments (#153: container must be scrollable)
    const scrollContainer = page.locator('.overflow-y-auto').last();
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(500);

    // Oldest comment should be visible after scrolling
    await expect(page.getByText('Comment #1').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should display comments when transitioning from 0 to N', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Switch to Shout tab before adding comments
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Add comments after page load (simulating real-time arrival)
    const comments = buildManyComments(5, false);
    await broadcastEventsOnAllRelays(page, comments);

    // Comments should appear (newest shown first in chat style)
    await expect(page.getByText('Comment #5').first()).toBeVisible({ timeout: 20_000 });
  });

  test('should display 20+ timed comments', async ({ page }) => {
    const comments = buildManyComments(25, true);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, comments);

    // Timed comments appear in Flow tab (default)
    // Flow tab button shows count "(25)"
    await expect(
      page.locator('button').filter({ hasText: /🎶/ }).filter({ hasText: '25' }).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test('should show both timed and general sections simultaneously', async ({ page }) => {
    const timedComments = buildManyComments(5, true);
    // Use different identity for general to avoid ID collision
    const genIdentity = createTestIdentity();
    const now = Math.floor(Date.now() / 1000);
    const generalEvents = Array.from({ length: 5 }, (_, i) =>
      finalizeEvent(
        {
          kind: COMMENT_KIND,
          content: `General #${i + 1}`,
          tags: [
            ['I', TEST_I_TAG],
            ['K', TEST_K_TAG]
          ],
          created_at: now + i
        },
        genIdentity.sk
      )
    );

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [...timedComments, ...generalEvents]);

    // Timed comments appear in Flow tab (default) — count shows "(5)"
    await expect(
      page.locator('button').filter({ hasText: /🎶/ }).filter({ hasText: '5' }).first()
    ).toBeVisible({ timeout: 20_000 });

    // Switch to Shout tab to see general comments
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    // Shout tab shows general comment count "(5)"
    await expect(
      page.locator('button').filter({ hasText: /📢/ }).filter({ hasText: '5' }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
