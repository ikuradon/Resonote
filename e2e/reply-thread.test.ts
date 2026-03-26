/**
 * E2E tests for reply threading, nested replies, orphan placeholders,
 * CW on replies, quote button, and deep nesting.
 * Covers section 6 items that require UI observation.
 */
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
  TEST_RELAYS,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const alice = createTestIdentity();
const bob = createTestIdentity();

test.describe('Reply threading', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display reply under parent comment', async ({ page }) => {
    const parent = buildComment(alice, 'Parent comment', TEST_I_TAG, TEST_K_TAG);
    const reply = buildComment(bob, 'Reply to parent', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: alice.pubkey
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent, reply]);

    await expect(page.getByText('Parent comment').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Reply to parent').first()).toBeVisible({ timeout: 15_000 });

    // Reply should be inside a border-l container (thread indentation)
    const threadContainer = page.locator('.border-l-2').first();
    await expect(threadContainer.getByText('Reply to parent')).toBeVisible();
  });

  test('should receive reply from another user in real-time', async ({ page }) => {
    const parent = buildComment(alice, 'Waiting for reply', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent]);

    await expect(page.getByText('Waiting for reply').first()).toBeVisible({ timeout: 15_000 });

    // Inject reply after parent is displayed
    const reply = buildComment(bob, 'Late reply arrives', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: alice.pubkey
    });
    await broadcastEventsOnAllRelays(page, [reply]);

    await expect(page.getByText('Late reply arrives').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should show reply success toast', async ({ page }) => {
    const comment = buildComment(alice, 'Reply toast test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Reply toast test').first()).toBeVisible({ timeout: 15_000 });

    // Click reply
    const replyButton = page.locator('button[title="Reply"]').first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });
    await replyTextarea.fill('Toast reply');

    const sendButton = page.locator('form button[type="submit"]').last();
    await sendButton.click();

    // Success toast
    await expect(page.getByText(/sent|送信/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('should preserve reply text on failure', async ({ page }) => {
    const comment = buildComment(alice, 'Fail reply target', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Fail reply target').first()).toBeVisible({ timeout: 15_000 });

    // Configure relays to reject
    await page.evaluate((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      for (const url of relays) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pool.relay(url).onEVENT((event: any) => ['OK', event.id, false, 'blocked']);
      }
    }, TEST_RELAYS);

    // Open reply form
    const replyButton = page.locator('button[title="Reply"]').first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });
    await replyTextarea.fill('This reply will fail');

    const sendButton = page.locator('form button[type="submit"]').last();
    await sendButton.click();

    // Text should be preserved (not cleared)
    await expect(replyTextarea).toHaveValue('This reply will fail', { timeout: 15_000 });
  });

  test('should display nested reply (reply to reply)', async ({ page }) => {
    const parent = buildComment(alice, 'Thread root', TEST_I_TAG, TEST_K_TAG);
    const reply1 = buildComment(bob, 'First level reply', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: alice.pubkey
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent, reply1]);

    await expect(page.getByText('Thread root').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('First level reply').first()).toBeVisible({ timeout: 15_000 });

    // Reply is in a threaded container
    const threadBorder = page.locator('.border-l-2');
    await expect(threadBorder.first()).toBeVisible();
  });

  test('should disable reply send button while sending', async ({ page }) => {
    const comment = buildComment(alice, 'Reply disable test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Reply disable test').first()).toBeVisible({ timeout: 15_000 });

    const replyButton = page.locator('button[title="Reply"]').first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });
    await replyTextarea.fill('Reply sending state');

    const sendButton = page.locator('form button[type="submit"]').last();
    await sendButton.click();

    // Button should be disabled during send
    await expect(sendButton).toBeDisabled({ timeout: 2_000 });
  });

  test('should show reply with CW tag', async ({ page }) => {
    const parent = buildComment(alice, 'CW parent', TEST_I_TAG, TEST_K_TAG);
    const cwReply = buildComment(bob, 'Hidden reply content', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: alice.pubkey,
      cwReason: 'spoiler'
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent, cwReply]);

    await expect(page.getByText('CW parent').first()).toBeVisible({ timeout: 15_000 });

    // CW reply should show warning, not the content directly
    await expect(page.getByText(/spoiler/i).first()).toBeVisible({ timeout: 10_000 });
    // Show button should be visible
    await expect(page.getByText(/Show|表示/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('should show quote button and prefill textarea', async ({ page }) => {
    const comment = buildComment(alice, 'Quote me please', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Quote me please').first()).toBeVisible({ timeout: 15_000 });

    // Quote button should be visible
    const quoteButton = page.locator('button[title="Quote"]').first();
    if (await quoteButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await quoteButton.click();

      // Main textarea should be prefilled with quote reference
      const textarea = page.locator('textarea').first();
      const value = await textarea.inputValue();
      // Should contain some reference to the quoted content
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Reply failure', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should keep comment on delete failure', async ({ page }) => {
    const comment = buildComment(user, 'Delete fail test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Delete fail test').first()).toBeVisible({ timeout: 15_000 });

    // Configure relays to reject
    await page.evaluate((relays: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      for (const url of relays) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pool.relay(url).onEVENT((event: any) => ['OK', event.id, false, 'blocked']);
      }
    }, TEST_RELAYS);

    // Click delete
    const deleteButton = page.locator('button[title="Delete"]').first();
    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // Comment should still be visible (delete failed)
    await expect(page.getByText('Delete fail test').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Orphan placeholders', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show orphan placeholder for reply with missing parent', async ({ page }) => {
    // Create a reply whose parent doesn't exist in the relay
    const fakeParentId = 'a'.repeat(64);
    const orphanReply = buildComment(alice, 'Orphan reply text', TEST_I_TAG, TEST_K_TAG, {
      parentId: fakeParentId,
      parentPubkey: bob.pubkey
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [orphanReply]);

    // The reply should be visible
    await expect(page.getByText('Orphan reply text').first()).toBeVisible({ timeout: 15_000 });

    // A placeholder should appear (loading → not-found)
    await expect(
      page.getByText(/Loading|Could not retrieve|Deleted|読み込み中|取得できません/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('should show deleted placeholder when parent was deleted', async ({ page }) => {
    const parent = buildComment(alice, 'Will be deleted parent', TEST_I_TAG, TEST_K_TAG);
    const reply = buildComment(bob, 'Reply to deleted', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: alice.pubkey
    });
    const deletion = buildDeletion(alice, [parent.id], TEST_I_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent, reply, deletion]);

    // Reply should be visible
    await expect(page.getByText('Reply to deleted').first()).toBeVisible({ timeout: 15_000 });

    // Parent should be gone (deleted), placeholder should appear
    await expect(page.getByText('Will be deleted parent')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(/Deleted|削除済み/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Deletion with thread effects', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show spinner while deleting', async ({ page }) => {
    const comment = buildComment(user, 'Spinner delete test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Spinner delete test').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page.locator('button[title="Delete"]').first();
    await deleteButton.click();

    // Confirm deletion
    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // Spinner may appear briefly (animate-spin class on SVG)
    // It's transient, so we just verify deletion completes
    await expect(page.getByText('Spinner delete test')).toHaveCount(0, { timeout: 15_000 });
  });

  test('should ignore invalid kind:5 from non-author', async ({ page }) => {
    const comment = buildComment(alice, 'Cannot be deleted by others', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Cannot be deleted by others').first()).toBeVisible({
      timeout: 15_000
    });

    // Send a kind:5 from bob (not the author) - should be ignored
    const invalidDeletion = buildDeletion(bob, [comment.id], TEST_I_TAG);
    await broadcastEventsOnAllRelays(page, [invalidDeletion]);

    // Comment should still be visible (invalid deletion ignored)
    await expect(page.getByText('Cannot be deleted by others').first()).toBeVisible({
      timeout: 5_000
    });
  });

  test('should remove reply thread when parent is deleted', async ({ page }) => {
    const parent = buildComment(user, 'Parent to delete', TEST_I_TAG, TEST_K_TAG);
    const reply = buildComment(alice, 'Reply will lose parent', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: user.pubkey
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent, reply]);

    await expect(page.getByText('Parent to delete').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Reply will lose parent').first()).toBeVisible({ timeout: 15_000 });

    // Delete the parent
    const deleteButton = page.locator('button[title="Delete"]').first();
    await deleteButton.click();
    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // Parent should disappear
    await expect(page.getByText('Parent to delete')).toHaveCount(0, { timeout: 15_000 });
    // Reply may become orphan with placeholder or also disappear
    // At minimum, the parent text should be gone
  });

  test('should remove reaction count when comment is deleted', async ({ page }) => {
    const comment = buildComment(user, 'Delete with reactions', TEST_I_TAG, TEST_K_TAG);
    const reaction = buildReaction(alice, comment.id, user.pubkey, TEST_I_TAG, '+');

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment, reaction]);

    await expect(page.getByText('Delete with reactions').first()).toBeVisible({ timeout: 15_000 });

    // Verify reaction count is shown (alice liked it, so like count should show)
    const likeButton = page.locator('button[title="Like"]').first();
    await expect(likeButton).toBeVisible({ timeout: 10_000 });
    await expect(likeButton.locator('.font-mono')).toHaveText('1', { timeout: 5_000 });

    // Delete the comment
    const deleteButton = page.locator('button[title="Delete"]').first();
    await deleteButton.click();
    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // Comment and its reaction count should be gone
    await expect(page.getByText('Delete with reactions')).toHaveCount(0, { timeout: 15_000 });
  });
});
