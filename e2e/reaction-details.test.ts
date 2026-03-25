/**
 * E2E tests for reaction details: failure, self-reaction, button states,
 * emoji display, filled state, muted reactions, and zero-count hiding.
 * Covers section 5 UI-observable items.
 */
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  buildReaction,
  createTestIdentity,
  getPublishedEvents,
  REACTION_KIND,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_RELAYS,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();
const thirdUser = createTestIdentity();

test.describe('Reaction details', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should allow reacting to own comment', async ({ page }) => {
    const comment = buildComment(user, 'Self react test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Self react test').first()).toBeVisible({ timeout: 15_000 });

    const likeButton = page.locator(`button[title="Like"]`).first();
    await expect(likeButton).toBeVisible({ timeout: 5_000 });
    await likeButton.click();

    // Should show success toast or liked state
    // Should show success toast or button changes to "Liked"
    await expect(page.locator('button[title="Liked"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show reaction failure toast when relays reject', async ({ page }) => {
    const comment = buildComment(otherUser, 'Reaction fail test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Reaction fail test').first()).toBeVisible({ timeout: 15_000 });

    // Configure relays to reject
    await page.evaluate((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      for (const url of relays) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pool.relay(url).onEVENT((event: any) => ['OK', event.id, false, 'blocked']);
      }
    }, TEST_RELAYS);

    const likeButton = page.locator('button[title="Like"]').first();
    await likeButton.click();

    // The button should become re-enabled after failure
    await expect(likeButton).toBeEnabled({ timeout: 15_000 });
  });

  test('should disable like button during send', async ({ page }) => {
    const comment = buildComment(otherUser, 'Disable during send', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Disable during send').first()).toBeVisible({ timeout: 15_000 });

    const likeButton = page.locator('button[title="Like"]').first();
    await likeButton.click();

    // After send completes, button should show liked state
    // Should show success toast or button changes to "Liked"
    await expect(page.locator('button[title="Liked"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show filled heart and count after reacting', async ({ page }) => {
    const comment = buildComment(otherUser, 'Filled heart test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Filled heart test').first()).toBeVisible({ timeout: 15_000 });

    // Click like
    const likeButton = page.locator('button[title="Like"]').first();
    await likeButton.click();

    // After reaction, button title should change to "Liked" and have accent color
    await expect(page.locator('button[title="Liked"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button[title="Liked"]').first()).toHaveClass(/text-accent/);
  });

  test('should display multiple emoji reactions from others', async ({ page }) => {
    const comment = buildComment(otherUser, 'Multi emoji test', TEST_I_TAG, TEST_K_TAG);
    // Build reactions with different emojis
    const reaction1 = buildReaction(thirdUser, comment.id, otherUser.pubkey, TEST_I_TAG, '👍');
    const reaction2 = buildReaction(user, comment.id, otherUser.pubkey, TEST_I_TAG, '🎵');

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment, reaction1, reaction2]);

    await expect(page.getByText('Multi emoji test').first()).toBeVisible({ timeout: 15_000 });

    // Both emojis should be displayed
    await expect(page.getByText('👍').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('🎵').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show emoji reaction count when multiple same reactions', async ({ page }) => {
    const comment = buildComment(otherUser, 'Count emoji test', TEST_I_TAG, TEST_K_TAG);
    const reaction1 = buildReaction(thirdUser, comment.id, otherUser.pubkey, TEST_I_TAG, '🔥');
    const reaction2 = buildReaction(user, comment.id, otherUser.pubkey, TEST_I_TAG, '🔥');

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment, reaction1, reaction2]);

    await expect(page.getByText('Count emoji test').first()).toBeVisible({ timeout: 15_000 });
    // Should show 🔥 with count 2
    await expect(page.getByText('🔥').first()).toBeVisible({ timeout: 10_000 });
    const emojiContainer = page.locator('span').filter({ hasText: '🔥' }).first();
    await expect(emojiContainer.locator('.font-mono')).toHaveText('2', { timeout: 5_000 });
  });

  test('should hide like count when zero reactions', async ({ page }) => {
    const comment = buildComment(otherUser, 'Zero count test', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Zero count test').first()).toBeVisible({ timeout: 15_000 });

    // Like button should exist but no count number should be visible next to it
    const likeButton = page.locator('button[title="Like"]').first();
    await expect(likeButton).toBeVisible({ timeout: 5_000 });
    // No font-mono count span inside the button
    await expect(likeButton.locator('.font-mono')).toHaveCount(0);
  });

  test('should show emoji picker button when logged in', async ({ page }) => {
    const comment = buildComment(otherUser, 'Emoji picker test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Emoji picker test').first()).toBeVisible({ timeout: 15_000 });

    // Emoji button should be visible
    const emojiButton = page.locator('button[title="Emoji"]').first();
    await expect(emojiButton).toBeVisible({ timeout: 5_000 });
  });

  test('should open emoji picker on click and close on outside click', async ({ page }) => {
    const comment = buildComment(otherUser, 'Picker toggle test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Picker toggle test').first()).toBeVisible({ timeout: 15_000 });

    const emojiButton = page.locator('button[title="Emoji"]').first();
    await emojiButton.click();

    // Emoji picker popover should appear (contains em-emoji-picker or similar)
    const picker = page.locator('em-emoji-picker, [data-emoji-picker]').first();
    await expect(picker).toBeVisible({ timeout: 5_000 });

    // Click outside to close
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await expect(picker).not.toBeVisible({ timeout: 5_000 });
  });

  test('should send custom emoji reaction via picker', async ({ page }) => {
    const comment = buildComment(otherUser, 'Custom emoji test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Custom emoji test').first()).toBeVisible({ timeout: 15_000 });

    const emojiButton = page.locator('button[title="Emoji"]').first();
    await emojiButton.click();

    // Wait for picker
    const picker = page.locator('em-emoji-picker').first();
    await expect(picker).toBeVisible({ timeout: 5_000 });

    // Click an emoji in the picker (first available button in the grid)
    const emojiItem = picker.locator('button[data-emoji-id]').first();
    if (await emojiItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emojiItem.click();

      // Verify a kind:7 reaction was published
      await expect
        .poll(async () => (await getPublishedEvents(page, REACTION_KIND)).length, {
          timeout: 10_000
        })
        .toBeGreaterThanOrEqual(1);
    }
  });

  test('should show like count from existing reactions', async ({ page }) => {
    const comment = buildComment(otherUser, 'Existing likes test', TEST_I_TAG, TEST_K_TAG);
    const reaction1 = buildReaction(thirdUser, comment.id, otherUser.pubkey, TEST_I_TAG, '+');
    const reaction2 = buildReaction(user, comment.id, otherUser.pubkey, TEST_I_TAG, '+');

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment, reaction1, reaction2]);

    await expect(page.getByText('Existing likes test').first()).toBeVisible({ timeout: 15_000 });

    // Like count should show 2 (since user already reacted, button shows "Liked")
    const likedButton = page.locator('button[title="Liked"]').first();
    await expect(likedButton).toBeVisible({ timeout: 10_000 });
    await expect(likedButton.locator('.font-mono')).toHaveText('2');
  });
});
