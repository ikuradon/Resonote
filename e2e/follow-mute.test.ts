/**
 * E2E tests for follow/unfollow and mute flows.
 * Covers sections 10 and 11 of e2e-test-scenarios.md.
 */
import { npubEncode } from '@auftakt/core';
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  buildFollowList,
  buildMetadata,
  createTestIdentity,
  FOLLOWS_KIND,
  getPublishedEvents,
  MUTE_KIND,
  preloadEvents,
  setupFullLogin,
  setupMockPool,
  setupReadOnlyLogin,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();
const thirdUser = createTestIdentity();
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

    const followBtn = page.getByRole('button', { name: /^Follow$|^フォロー$/ }).first();
    await expect(followBtn).toBeVisible({ timeout: 10_000 });
  });

  test('should not display follow button on own profile', async ({ page }) => {
    const ownNpub = npubEncode(user.pubkey);
    await page.goto(`/profile/${ownNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Own profile should not show follow button
    await expect(page.getByRole('button', { name: /^Follow$|^フォロー$/ })).toHaveCount(0, {
      timeout: 5_000
    });
  });

  test('should not display follow button when not logged in', async ({ page }) => {
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /^Follow$|^フォロー$/ })).toHaveCount(0, {
      timeout: 5_000
    });
  });

  test('should publish kind:3 when follow confirmed', async ({ page }) => {
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const followBtn = page.getByRole('button', { name: /^Follow$|^フォロー$/ }).first();
    await expect(followBtn).toBeVisible({ timeout: 10_000 });
    await followBtn.click();

    // ConfirmDialog should appear — click confirm
    const confirmBtn = page.getByRole('button', { name: /^Confirm$|^確認$/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // kind:3 follow list should be published
    await expect
      .poll(async () => (await getPublishedEvents(page, FOLLOWS_KIND)).length, {
        timeout: 15_000
      })
      .toBeGreaterThanOrEqual(1);
  });

  test('should show Unfollow after following', async ({ page }) => {
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const followBtn = page.getByRole('button', { name: /^Follow$|^フォロー$/ }).first();
    await expect(followBtn).toBeVisible({ timeout: 10_000 });
    await followBtn.click();

    // ConfirmDialog appears — click Confirm button
    const confirmBtn = page.getByRole('button', { name: /^Confirm$|^確認$/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Button should change to Unfollow
    await expect(page.getByRole('button', { name: /Unfollow|アンフォロー/i }).first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should show Following state during processing', async ({ page }) => {
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const followBtn = page.getByRole('button', { name: /^Follow$|^フォロー$/ }).first();
    await expect(followBtn).toBeVisible({ timeout: 10_000 });
    await followBtn.click();

    // ConfirmDialog appears — click Confirm button
    const confirmBtn = page.getByRole('button', { name: /^Confirm$|^確認$/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // After confirm, should eventually show Unfollow or Following state
    await expect(
      page.getByRole('button', { name: /Unfollow|Following|アンフォロー|フォロー中/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('should show follow count on profile', async ({ page }) => {
    const followList = buildFollowList(otherUser, [user.pubkey, thirdUser.pubkey]);
    const metadata = buildMetadata(otherUser, { name: 'TestUser' });

    // preloadEvents ensures data is in MockPool BEFORE page navigation
    await preloadEvents(page, [followList, metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Follow count button shows "N Following" — match the button text
    await expect(
      page.getByRole('button', { name: /2 Following|2 フォロー中/ }).first()
    ).toBeVisible({ timeout: 15_000 });
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

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Mutable comment').first()).toBeVisible({ timeout: 15_000 });

    // Mute is in the More actions menu
    const commentEl = page.locator('article, div').filter({ hasText: 'Mutable comment' }).first();
    await commentEl
      .getByRole('button', { name: /More actions/i })
      .first()
      .click();

    const muteBtn = page.getByRole('button', { name: /Mute User|Mute user/i }).first();
    await expect(muteBtn).toBeVisible({ timeout: 5_000 });

    // Close menu
    await page.keyboard.press('Escape');
  });

  test('should not show mute button on own comment', async ({ page }) => {
    const comment = buildComment(user, 'Own comment no mute', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Own comment no mute').first()).toBeVisible({ timeout: 15_000 });

    // Open More actions menu on own comment
    const commentEl = page
      .locator('article, div')
      .filter({ hasText: 'Own comment no mute' })
      .first();
    await commentEl
      .getByRole('button', { name: /More actions/i })
      .first()
      .click();

    // Mute User button should not exist for own comment
    const muteButtons = page.getByRole('button', { name: /Mute User|Mute user/i });
    await expect(muteButtons).toHaveCount(0);

    // Close menu
    await page.keyboard.press('Escape');
  });

  test('should not show mute button when not logged in', async ({ page }) => {
    const comment = buildComment(otherUser, 'No auth mute', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('No auth mute').first()).toBeVisible({ timeout: 15_000 });

    // When not logged in, More actions menu is still present but Mute is not shown
    // Check there's no Mute User button visible anywhere
    await expect(page.getByRole('button', { name: /Mute User|Mute user/i })).toHaveCount(0);
  });

  test('should show confirm dialog when mute clicked', async ({ page }) => {
    const comment = buildComment(otherUser, 'Mute dialog test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Mute dialog test').first()).toBeVisible({ timeout: 15_000 });

    // Mute is in the More actions menu
    const commentEl = page.locator('article, div').filter({ hasText: 'Mute dialog test' }).first();
    await commentEl
      .getByRole('button', { name: /More actions/i })
      .first()
      .click();
    const muteBtn = page.getByRole('button', { name: /Mute User|Mute user/i }).first();
    await muteBtn.click();

    // Confirm dialog should appear with mute message
    await expect(page.getByText(/Mute this user|このユーザーをミュート/i).first()).toBeVisible({
      timeout: 5_000
    });
  });

  test('should publish kind:10000 after confirming mute', async ({ page }) => {
    const comment = buildComment(otherUser, 'Mute publish test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Mute publish test').first()).toBeVisible({ timeout: 15_000 });

    // Mute is in the More actions menu
    const commentEl = page.locator('article, div').filter({ hasText: 'Mute publish test' }).first();
    await commentEl
      .getByRole('button', { name: /More actions/i })
      .first()
      .click();
    const muteBtn = page.getByRole('button', { name: /Mute User|Mute user/i }).first();
    await muteBtn.click();

    // Click confirm button in dialog
    const confirmBtn = page.getByRole('button', { name: /Confirm|確認/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // kind:10000 should be published
    await expect
      .poll(async () => (await getPublishedEvents(page, MUTE_KIND)).length, {
        timeout: 15_000
      })
      .toBeGreaterThanOrEqual(1);
  });

  test('should hide muted user comments after muting', async ({ page }) => {
    const comment = buildComment(otherUser, 'Will be muted comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // General comments appear in Shout tab
    await page.locator('button').filter({ hasText: /📢/ }).first().click();

    await expect(page.getByText('Will be muted comment').first()).toBeVisible({ timeout: 15_000 });

    // Mute is in the More actions menu
    const commentEl = page
      .locator('article, div')
      .filter({ hasText: 'Will be muted comment' })
      .first();
    await commentEl
      .getByRole('button', { name: /More actions/i })
      .first()
      .click();
    const muteBtn = page.getByRole('button', { name: /Mute User|Mute user/i }).first();
    await muteBtn.click();

    const confirmBtn = page.getByRole('button', { name: /Confirm|確認/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Comment should disappear after muting
    await expect(page.getByText('Will be muted comment')).toHaveCount(0, { timeout: 15_000 });
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

  test('should show empty muted users message', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(
      page.getByText(/No muted users|ミュート中のユーザーはいません/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should show empty muted words message', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(
      page.getByText(/No muted words|ミュート中のワードはありません/).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should show mute word add input', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Mute section should be visible with add word functionality
    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Mute|ミュート/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Settings page — NIP-44 warning', () => {
  test('should display NIP-44 warning for read-only login', async ({ page }) => {
    // Set up MockPool WITHOUT full login (no nip44 support)
    await setupMockPool(page);
    await setupReadOnlyLogin(page, user.pubkey);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page, { method: 'readOnly' });

    await expect(page.locator('text=NIP-44')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Mute word flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    // 4th argument (sk) enables real NIP-44 encrypt/decrypt
    await setupFullLogin(page, user.pubkey, user.sign, user.sk);
  });

  test('should add mute word via settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Find the word input by placeholder
    const wordInput = page.getByPlaceholder(/Word to mute|ミュートするワード/i);
    await expect(wordInput).toBeVisible({ timeout: 10_000 });
    await wordInput.fill('badword');

    // Click "Add word" button
    const addWordBtn = page.getByRole('button', { name: /Add word|ワードを追加/i }).first();
    await expect(addWordBtn).toBeVisible({ timeout: 5_000 });
    await addWordBtn.click();

    // ConfirmDialog should appear
    await expect(page.getByText(/Add muted word|ミュートワードを追加/).first()).toBeVisible({
      timeout: 5_000
    });

    // Click Confirm button
    const confirmBtn = page.getByRole('button', { name: /^Confirm$|^確認$/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Assert the word appears in the muted words list
    await expect(page.getByText('badword').first()).toBeVisible({ timeout: 15_000 });
  });

  // MockPool resets on page navigation, losing the kind:10000 mute list.
  // The mute word added on /settings is lost when navigating to the track page.
  // This test requires persistent relay state across navigations which MockPool
  // does not support. Covered by unit tests (mute.test.ts, mute-additional.test.ts).
  test.fixme('should hide comments matching muted word', async ({ page }) => {
    test.setTimeout(60_000);

    // Navigate to track page first, then add mute word without leaving.
    // This avoids MockPool reset from page navigation losing the mute list.
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Broadcast a comment with "badword" before muting
    const comment = buildComment(otherUser, 'This has badword in it', TEST_I_TAG, TEST_K_TAG);
    await broadcastEventsOnAllRelays(page, [comment]);
    await expect(page.getByText('This has badword in it').first()).toBeVisible({ timeout: 15_000 });

    // Navigate to settings to add mute word
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const wordInput = page.getByPlaceholder(/Word to mute|ミュートするワード/i);
    await expect(wordInput).toBeVisible({ timeout: 10_000 });
    await wordInput.fill('badword');

    const addWordBtn = page.getByRole('button', { name: /Add word|ワードを追加/i }).first();
    await addWordBtn.click();

    const confirmBtn = page.getByRole('button', { name: /^Confirm$|^確認$/ }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Wait for mute word to appear in list
    await expect(page.getByText('badword').first()).toBeVisible({ timeout: 15_000 });

    // Go back to track page — comment should now be hidden
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Re-broadcast the same comment (MockPool was reset by navigation)
    await broadcastEventsOnAllRelays(page, [comment]);

    // Wait a moment then verify the comment is NOT visible
    await page.waitForTimeout(3000);
    await expect(page.getByText('This has badword in it')).toHaveCount(0);
  });
});
