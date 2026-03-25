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

    // Wait for first and last to be in DOM (virtual scroll may not render all)
    await expect(page.getByText('Comment #25').first()).toBeVisible({ timeout: 20_000 });

    // General section should exist
    await expect(
      page
        .locator('span')
        .filter({ hasText: /^General$|^全体$/ })
        .first()
    ).toBeVisible();

    // Count badge should show 25
    await expect(page.locator('span.font-mono').filter({ hasText: '25' }).first()).toBeVisible();

    // Scroll down to see older comments (#153: container must be scrollable)
    const scrollContainer = page.locator('.overflow-y-auto').last();
    await scrollContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);

    // Oldest comment should be visible after scrolling
    await expect(page.getByText('Comment #1').first()).toBeVisible({ timeout: 5_000 });
  });
  test('should display comments when transitioning from 0 to N', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Add comments after page load (simulating real-time arrival)
    const comments = buildManyComments(5, false);
    await broadcastEventsOnAllRelays(page, comments);

    // Comments should appear
    await expect(page.getByText('Comment #1').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Comment #5').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should display 20+ timed comments', async ({ page }) => {
    const comments = buildManyComments(25, true);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, comments);

    // Timed section should exist
    await expect(
      page
        .locator('span')
        .filter({ hasText: /Time Comments|時間コメント/ })
        .first()
    ).toBeVisible({ timeout: 20_000 });

    // Count badge should show 25
    await expect(page.locator('span.font-mono').filter({ hasText: '25' }).first()).toBeVisible();
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

    // Both sections should exist
    await expect(
      page
        .locator('span')
        .filter({ hasText: /Time Comments|時間コメント/ })
        .first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .locator('span')
        .filter({ hasText: /^General$|^全体$/ })
        .first()
    ).toBeVisible();
  });
});
