/**
 * E2E tests for follow/unfollow and mute flows.
 * Covers sections 10 and 11 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';
import { npubEncode } from 'nostr-tools/nip19';

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
const otherNpub = npubEncode(otherUser.pubkey);

test.describe('Profile page — follow/unfollow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display follow button on other user profile', async ({ page }) => {
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const followBtn = page.getByRole('button', { name: /Follow|フォロー/i }).first();
    await expect(followBtn).toBeVisible({ timeout: 10_000 });
  });

  test('should not display follow button on own profile', async ({ page }) => {
    const ownNpub = npubEncode(user.pubkey);
    await page.goto(`/profile/${ownNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Own profile should not show follow button
    // Wait for page to settle, then check
    await page.waitForTimeout(2_000);
    await expect(page.getByRole('button', { name: /^Follow$|^フォロー$/ })).toHaveCount(0);
  });

  // This test needs its own setup without login — beforeEach sets up full login
  test('should not display follow button when not logged in', async ({ page }) => {
    // Navigate without triggering simulateLogin
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');

    // Without simulateLogin, the user is not logged in → no follow button
    // Wait briefly for page to settle
    await page.waitForTimeout(2_000);
    await expect(page.getByRole('button', { name: /^Follow$|^フォロー$/ })).toHaveCount(0);
  });
});

test.describe('Mute from comment card', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show mute button on other user comment', async ({ page }) => {
    const comment = buildComment(otherUser, 'Mutable comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Mutable comment').first()).toBeVisible({ timeout: 15_000 });

    const muteBtn = page
      .locator('article, div')
      .filter({ hasText: 'Mutable comment' })
      .first()
      .locator('button[title]')
      .filter({ has: page.locator('svg') })
      .last();
    await expect(muteBtn).toBeVisible({ timeout: 5_000 });
  });

  test('should not show mute button on own comment', async ({ page }) => {
    const comment = buildComment(user, 'Own comment no mute', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Own comment no mute').first()).toBeVisible({ timeout: 15_000 });

    const commentCard = page
      .locator('article, div')
      .filter({ hasText: 'Own comment no mute' })
      .first();
    const muteButtons = commentCard.getByRole('button', { name: /Mute|ミュート/i });
    await expect(muteButtons).toHaveCount(0);
  });

  test('should not show mute button when not logged in', async ({ page }) => {
    const comment = buildComment(otherUser, 'No auth mute', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('No auth mute').first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('button', { name: /Mute|ミュート/i })).toHaveCount(0);
  });
});

test.describe('Settings page — mute section', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display mute section heading', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Mute|ミュート/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should display NIP-44 warning for read-only login', async ({ page }) => {
    // Use read-only login (no signEvent)
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async (pk: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = { getPublicKey: async () => pk };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, user.pubkey);

    await expect(page.locator('text=NIP-44')).toBeVisible({ timeout: 10_000 });
  });
});
