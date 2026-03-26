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
const alice = createTestIdentity();
const bob = createTestIdentity();

test.describe('Real-time comment reception', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display comment from another user in real-time', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const comment = buildComment(alice, 'Hello from Alice!', TEST_I_TAG, TEST_K_TAG);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Hello from Alice!').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should deduplicate same event from multiple relays', async ({ page }) => {
    const comment = buildComment(alice, 'Dedup test comment', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Dedup test comment').first()).toBeVisible({ timeout: 15_000 });

    const matches = page.getByText('Dedup test comment');
    await expect(matches).toHaveCount(1);
  });

  test('should display multiple comments from different users', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const commentA = buildComment(alice, 'Alice says hi', TEST_I_TAG, TEST_K_TAG);
    const commentB = buildComment(bob, 'Bob says hello', TEST_I_TAG, TEST_K_TAG);
    await broadcastEventsOnAllRelays(page, [commentA, commentB]);

    await expect(page.getByText('Alice says hi').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Bob says hello').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Comment ordering', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should sort timed comments by position ascending', async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    // Out-of-order positions: 1:30, 0:30, 1:00
    const c1 = buildComment(alice, 'At 1:30', TEST_I_TAG, TEST_K_TAG, {
      positionSec: 90,
      createdAt: now
    });
    const c2 = buildComment(bob, 'At 0:30', TEST_I_TAG, TEST_K_TAG, {
      positionSec: 30,
      createdAt: now + 1
    });
    const c3 = buildComment(user, 'At 1:00', TEST_I_TAG, TEST_K_TAG, {
      positionSec: 60,
      createdAt: now + 2
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [c1, c2, c3]);

    await expect(page.getByText('At 0:30').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('At 1:00').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('At 1:30').first()).toBeVisible({ timeout: 15_000 });

    // Verify position-ascending order within timed section.
    // 3 items are within VirtualScrollList overscan (5), so all render in DOM.
    const timedSection = page
      .locator('section')
      .filter({ hasText: /Time|時間/ })
      .first();
    const texts = await timedSection.locator('text=At ').allTextContents();
    const ordered = texts.filter((t) => t.startsWith('At '));
    expect(ordered).toEqual(['At 0:30', 'At 1:00', 'At 1:30']);
  });

  test('should sort general comments by created_at descending (newest first)', async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const older = buildComment(alice, 'Older comment', TEST_I_TAG, TEST_K_TAG, {
      createdAt: now - 100
    });
    const newer = buildComment(bob, 'Newer comment', TEST_I_TAG, TEST_K_TAG, {
      createdAt: now
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [older, newer]);

    await expect(page.getByText('Newer comment').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Older comment').first()).toBeVisible({ timeout: 15_000 });

    // Verify newest-first order within general section
    const generalSection = page
      .locator('section')
      .filter({ hasText: /General|全体/ })
      .first();
    const texts = await generalSection.locator('text=/er comment$/').allTextContents();
    const ordered = texts.filter((t) => t === 'Newer comment' || t === 'Older comment');
    expect(ordered).toEqual(['Newer comment', 'Older comment']);
  });

  test('should separate timed and general comments into different sections', async ({ page }) => {
    const timed = buildComment(alice, 'Timed comment here', TEST_I_TAG, TEST_K_TAG, {
      positionSec: 45
    });
    const general = buildComment(bob, 'General comment here', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [timed, general]);

    await expect(page.getByText('Timed comment here').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('General comment here').first()).toBeVisible({ timeout: 15_000 });

    await expect(
      page
        .locator('span')
        .filter({ hasText: /Time Comments|時間コメント/ })
        .first()
    ).toBeVisible();

    await expect(
      page
        .locator('span')
        .filter({ hasText: /^General$|^全体$/ })
        .first()
    ).toBeVisible();
  });
});

test.describe('Comment filter bar', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show filter bar when logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByRole('button', { name: /^All$|^すべて$/ }).first()).toBeVisible({
      timeout: 10_000
    });
    await expect(page.getByRole('button', { name: /^Follows$|^フォロー$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^WoT$/ }).first()).toBeVisible();
  });

  test('should hide filter bar when not logged in', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /^All$|^すべて$/ })).toHaveCount(0);
  });
});
