/**
 * E2E tests for reply threading, nested replies, and orphan placeholders.
 * Covers sections 6 items that require UI observation.
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

test.describe('Reply threading', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display reply under parent comment', async ({ page }) => {
    // Create parent comment and reply
    const parent = buildComment(alice, 'Parent comment', TEST_I_TAG, TEST_K_TAG);
    const reply = buildComment(bob, 'Reply to parent', TEST_I_TAG, TEST_K_TAG, {
      parentId: parent.id,
      parentPubkey: alice.pubkey
    });

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [parent, reply]);

    // Parent should be visible
    await expect(page.getByText('Parent comment').first()).toBeVisible({ timeout: 15_000 });

    // Reply should appear (may need to expand thread)
    await expect(page.getByText('Reply to parent').first()).toBeVisible({ timeout: 15_000 });
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
    const replyButton = page
      .locator('article, div')
      .filter({ hasText: 'Reply toast test' })
      .first()
      .getByRole('button', { name: /Reply|返信/i })
      .first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });
    await replyTextarea.fill('Toast reply');

    const sendButton = page.getByRole('button', { name: /Reply|返信/i }).last();
    await sendButton.click();

    // Success toast
    await expect(page.getByText(/sent|送信/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Reply failure', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should preserve reply text on failure', async ({ page }) => {
    const comment = buildComment(alice, 'Fail reply target', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Fail reply target').first()).toBeVisible({ timeout: 15_000 });

    // Configure relays to reject
    await page.evaluate(
      (relays: string[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pool = (window as any).__mockPool;
        for (const url of relays) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pool.relay(url).onEVENT((event: any) => ['OK', event.id, false, 'blocked']);
        }
      },
      ['wss://relay1.test', 'wss://relay2.test', 'wss://relay3.test', 'wss://relay4.test']
    );

    // Open reply form
    const replyButton = page
      .locator('article, div')
      .filter({ hasText: 'Fail reply target' })
      .first()
      .getByRole('button', { name: /Reply|返信/i })
      .first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });
    await replyTextarea.fill('This reply will fail');

    const sendButton = page.getByRole('button', { name: /Reply|返信/i }).last();
    await sendButton.click();

    // Text should be preserved (not cleared)
    await expect(replyTextarea).toHaveValue('This reply will fail', { timeout: 15_000 });
  });
});

test.describe('Deletion failure', () => {
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
    await page.evaluate(
      (relays: string[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pool = (window as any).__mockPool;
        for (const url of relays) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pool.relay(url).onEVENT((event: any) => ['OK', event.id, false, 'blocked']);
        }
      },
      ['wss://relay1.test', 'wss://relay2.test', 'wss://relay3.test', 'wss://relay4.test']
    );

    // Click delete
    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Delete fail test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // Comment should still be visible (delete failed)
    await expect(page.getByText('Delete fail test').first()).toBeVisible({ timeout: 10_000 });
  });
});
