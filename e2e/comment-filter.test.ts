/**
 * E2E tests for comment filter bar (All / Follows / WoT).
 * Covers section 16 of e2e-test-scenarios.md.
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
const alice = createTestIdentity();
const bob = createTestIdentity();

test.describe('Comment filter — All', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show all comments when "All" filter is active', async ({ page }) => {
    const commentA = buildComment(alice, 'Alice all-filter comment', TEST_I_TAG, TEST_K_TAG);
    const commentB = buildComment(bob, 'Bob all-filter comment', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [commentA, commentB]);

    await expect(page.getByText('Alice all-filter comment').first()).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByText('Bob all-filter comment').first()).toBeVisible({
      timeout: 15_000
    });

    // "All" filter should be active by default
    const allButton = page.getByRole('button', { name: /^All$|^すべて$/ }).first();
    await expect(allButton).toHaveClass(/shadow-sm/, { timeout: 5_000 });
  });
});

test.describe('Comment filter — Follows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show "no comments from follows" when Follows filter active and no follows', async ({
    page
  }) => {
    const comment = buildComment(alice, 'Alice no-follow comment', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Alice no-follow comment').first()).toBeVisible({
      timeout: 15_000
    });

    const followsButton = page.getByRole('button', { name: /^Follows$|^フォロー$/ }).first();
    await followsButton.click();

    await expect(
      page.getByText(/No comments from follows|フォロー中のユーザーのコメントはありません/).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Comment filter — WoT', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show WoT filter button', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByRole('button', { name: /^WoT$/ }).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should restore all comments when switching back to All filter', async ({ page }) => {
    const comment = buildComment(alice, 'Switchback test comment', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Switchback test comment').first()).toBeVisible({
      timeout: 15_000
    });

    const followsButton = page.getByRole('button', { name: /^Follows$|^フォロー$/ }).first();
    await followsButton.click();

    await expect(
      page.getByText(/No comments from follows|フォロー中のユーザーのコメントはありません/).first()
    ).toBeVisible({ timeout: 10_000 });

    const allButton = page.getByRole('button', { name: /^All$|^すべて$/ }).first();
    await allButton.click();

    await expect(page.getByText('Switchback test comment').first()).toBeVisible({
      timeout: 10_000
    });
  });
});

test.describe('Comment filter — not logged in', () => {
  test('should hide filter bar when not logged in', async ({ page }) => {
    await setupMockPool(page);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /^All$|^すべて$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Follows$|^フォロー$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^WoT$/ })).toHaveCount(0);
  });
});
