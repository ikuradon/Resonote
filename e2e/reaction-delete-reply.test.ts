import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  buildDeletion,
  buildReaction,
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

test.describe('Reaction flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should send a reaction and update count', async ({ page }) => {
    const comment = buildComment(otherUser, 'Reactable comment', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Reactable comment').first()).toBeVisible({ timeout: 15_000 });

    const likeButton = page
      .locator('article, div')
      .filter({ hasText: 'Reactable comment' })
      .first()
      .getByRole('button', { name: /Like|いいね/i })
      .first();
    await expect(likeButton).toBeVisible({ timeout: 5_000 });
    await likeButton.click();

    await expect(page.getByText(/Reaction sent|リアクション/i).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should display reaction from another user in real-time', async ({ page }) => {
    const comment = buildComment(user, 'My comment for reaction', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('My comment for reaction').first()).toBeVisible({
      timeout: 15_000
    });

    const reaction = buildReaction(otherUser, comment.id, user.pubkey, TEST_I_TAG);
    await broadcastEventsOnAllRelays(page, [reaction]);

    const heartCount = page.locator('span.font-mono').filter({ hasText: '1' }).first();
    await expect(heartCount).toBeVisible({ timeout: 15_000 });
  });

  test('should not show reaction buttons when not logged in', async ({ page }) => {
    const comment = buildComment(otherUser, 'No-auth comment', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('No-auth comment').first()).toBeVisible({ timeout: 15_000 });

    const likeButtons = page.getByRole('button', { name: /Like|いいね/i });
    await expect(likeButtons).toHaveCount(0);
  });
});

test.describe('Delete flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should delete own comment via ConfirmDialog', async ({ page }) => {
    const comment = buildComment(user, 'Delete me', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Delete me').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Delete me' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await expect(deleteButton).toBeVisible({ timeout: 5_000 });
    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await confirmButton.click();

    await expect(page.getByText('Delete me')).toHaveCount(0, { timeout: 15_000 });
  });

  test('should cancel delete via ConfirmDialog', async ({ page }) => {
    const comment = buildComment(user, 'Keep me', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Keep me').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Keep me' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    const cancelButton = page.getByRole('button', { name: /Cancel|キャンセル/ }).last();
    await expect(cancelButton).toBeVisible({ timeout: 5_000 });
    await cancelButton.click();

    await expect(page.getByText('Keep me').first()).toBeVisible();
  });

  test('should not show delete button on other users comments', async ({ page }) => {
    const comment = buildComment(otherUser, 'Not yours', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Not yours').first()).toBeVisible({ timeout: 15_000 });

    const commentCard = page.locator('article, div').filter({ hasText: 'Not yours' }).first();
    const deleteButtons = commentCard.getByRole('button', { name: /Delete|削除/i });
    await expect(deleteButtons).toHaveCount(0);
  });

  test('should remove comment when kind:5 received from another relay', async ({ page }) => {
    const comment = buildComment(otherUser, 'Will be deleted remotely', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Will be deleted remotely').first()).toBeVisible({
      timeout: 15_000
    });

    const deletion = buildDeletion(otherUser, [comment.id], TEST_I_TAG);
    await broadcastEventsOnAllRelays(page, [deletion]);

    await expect(page.getByText('Will be deleted remotely')).toHaveCount(0, { timeout: 20_000 });
  });
});

test.describe('Reply flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should open reply form and post a reply', async ({ page }) => {
    const comment = buildComment(otherUser, 'Reply to me', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Reply to me').first()).toBeVisible({ timeout: 15_000 });

    const replyButton = page
      .locator('article, div')
      .filter({ hasText: 'Reply to me' })
      .first()
      .getByRole('button', { name: /Reply|返信/i })
      .first();
    await expect(replyButton).toBeVisible({ timeout: 5_000 });
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });

    await replyTextarea.fill('This is my reply');

    const sendButton = page.getByRole('button', { name: /Reply|返信/i }).last();
    await sendButton.click();

    await expect(page.getByText('This is my reply').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should cancel reply form', async ({ page }) => {
    const comment = buildComment(otherUser, 'Cancel reply test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Cancel reply test').first()).toBeVisible({ timeout: 15_000 });

    const replyButton = page
      .locator('article, div')
      .filter({ hasText: 'Cancel reply test' })
      .first()
      .getByRole('button', { name: /Reply|返信/i })
      .first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });

    const cancelButton = page.getByRole('button', { name: /Cancel|キャンセル/ }).last();
    await cancelButton.click();

    // Only the main comment textarea should remain
    await expect(page.locator('textarea')).toHaveCount(1, { timeout: 5_000 });
  });
});
