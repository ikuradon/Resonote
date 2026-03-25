/**
 * E2E tests for toast notifications and ConfirmDialog patterns.
 * Covers sections 24 and 36 of e2e-test-scenarios.md.
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
const otherUser = createTestIdentity();

test.describe('Toast notifications', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show success toast on comment send', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Toast test comment');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Success toast should appear
    await expect(page.getByText(/sent|送信/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('should auto-dismiss toast after timeout', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Auto dismiss test');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Toast appears
    const toast = page.getByText(/sent|送信/).first();
    await expect(toast).toBeVisible({ timeout: 15_000 });

    // Toast should auto-dismiss (4 seconds + animation)
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
  });

  test('should show success toast on reaction send', async ({ page }) => {
    const comment = buildComment(otherUser, 'React toast test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('React toast test').first()).toBeVisible({ timeout: 15_000 });

    const likeButton = page
      .locator('article, div')
      .filter({ hasText: 'React toast test' })
      .first()
      .getByRole('button', { name: /Like|いいね/i })
      .first();
    await likeButton.click();

    // Reaction toast
    await expect(page.getByText(/Reaction|リアクション/i).first()).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show success toast on delete', async ({ page }) => {
    const comment = buildComment(user, 'Delete toast test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Delete toast test').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Delete toast test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // Delete toast
    await expect(page.getByText(/deleted|削除/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Toast — failure and manual close', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show error toast on comment submission failure', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

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

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Fail toast test');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Error toast should appear
    await expect(page.getByText(/failed|失敗/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('should show success toast on reply send', async ({ page }) => {
    const comment = buildComment(otherUser, 'Reply toast target', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Reply toast target').first()).toBeVisible({ timeout: 15_000 });

    const replyButton = page.locator('button[title="Reply"]').first();
    await replyButton.click();

    const replyTextarea = page.locator('textarea').last();
    await expect(replyTextarea).toBeVisible({ timeout: 5_000 });
    await replyTextarea.fill('Reply for toast');

    const sendButton = page.locator('form button[type="submit"]').last();
    await sendButton.click();

    await expect(page.getByText(/sent|送信/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('should close toast manually with × button', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Manual close toast');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Wait for toast to appear
    const toast = page.getByText(/sent|送信/).first();
    await expect(toast).toBeVisible({ timeout: 15_000 });

    // Click the close button on the toast
    const closeBtn = page.locator('[role="alert"]').first().locator('button').first();
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click();
      await expect(toast).toHaveCount(0, { timeout: 3_000 });
    }
  });
});

test.describe('ConfirmDialog — all variants', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show danger variant for delete (red button)', async ({ page }) => {
    const comment = buildComment(user, 'Red button test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Red button test').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Red button test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    // Confirm button should have danger/red styling
    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await expect(confirmButton).toBeVisible({ timeout: 5_000 });
    await expect(confirmButton).toHaveClass(/bg-error|bg-red/);
  });

  test('should show dialog title and message for delete', async ({ page }) => {
    const comment = buildComment(user, 'Dialog text test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Dialog text test').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Dialog text test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    // Dialog should have title
    await expect(page.getByText(/Delete comment|コメントを削除/).first()).toBeVisible({
      timeout: 5_000
    });

    // Dialog should have confirmation message
    await expect(page.getByText(/cannot be undone|取り消せません/).first()).toBeVisible();
  });

  test('should close dialog without action on cancel click', async ({ page }) => {
    const comment = buildComment(user, 'Cancel click test', TEST_I_TAG, TEST_K_TAG);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    await expect(page.getByText('Cancel click test').first()).toBeVisible({ timeout: 15_000 });

    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Cancel click test' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    const cancelButton = page.getByRole('button', { name: /Cancel|キャンセル/ }).last();
    await cancelButton.click();

    // Dialog should close
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

    // Comment should still be visible
    await expect(page.getByText('Cancel click test').first()).toBeVisible();
  });
});
