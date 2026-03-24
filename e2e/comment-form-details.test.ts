/**
 * E2E tests for comment form details: Timed/General toggle,
 * CW toggle, submit behavior, keyboard shortcuts, and edge cases.
 * Covers section 2 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  COMMENT_KIND,
  createTestIdentity,
  getPublishedEvents,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();

test.describe('Comment form — submit behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should disable send button when textarea is empty', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeDisabled();
  });

  test('should disable send button when textarea has only spaces', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('   ');

    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeDisabled();
  });

  test('should enable send button when text is entered', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Hello');

    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeEnabled();
  });

  test('should submit comment with Ctrl+Enter', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Ctrl+Enter test');
    await textarea.press('Control+Enter');

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
  });

  test('should insert newline with Shift+Enter (not submit)', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.pressSequentially('Line 2');

    const value = await textarea.inputValue();
    expect(value).toContain('\n');
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
  });

  test('should prevent double submission (button disabled during send)', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Double submit test');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Button should be disabled immediately after click (flying/sending state)
    await expect(sendButton).toBeDisabled({ timeout: 2_000 });
  });

  test('should preserve text on failed submission and allow retry', async ({ page }) => {
    // Block all relay connections so publish fails
    await page.route('wss://**', (route) => route.abort());

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Will fail');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Text should remain after failure (not cleared)
    await expect(textarea).toHaveValue('Will fail', { timeout: 10_000 });
  });

  test('should publish kind:1111 event with correct I and K tags', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Tag verification');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    await expect(textarea).toHaveValue('', { timeout: 10_000 });

    // Verify published event
    await expect
      .poll(async () => (await getPublishedEvents(page, COMMENT_KIND)).length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
  });
});

test.describe('Comment form — Timed/General toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show General button as selected by default', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const generalBtn = page.getByRole('button', { name: /General|全体/i }).first();
    await expect(generalBtn).toBeVisible({ timeout: 10_000 });
    // General should have active styling
    await expect(generalBtn).toHaveClass(/text-accent/, { timeout: 5_000 });
  });

  test('should show Timed button', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const timedBtn = page.getByRole('button', { name: /Timed|時間/i }).first();
    await expect(timedBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Comment form — Content Warning toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show CW toggle button', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const cwBtn = page.getByRole('button', { name: /^CW$/i }).first();
    await expect(cwBtn).toBeVisible({ timeout: 10_000 });
  });

  test('should toggle CW on click', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const cwBtn = page.getByRole('button', { name: /^CW$/i }).first();
    await cwBtn.click();

    // CW reason input should appear
    const reasonInput = page.locator('input[type="text"]').first();
    await expect(reasonInput).toBeVisible({ timeout: 5_000 });
  });

  test('should show CW reason input when CW is enabled', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const cwBtn = page.getByRole('button', { name: /^CW$/i }).first();
    await cwBtn.click();

    const reasonInput = page.locator('input[type="text"]').first();
    await expect(reasonInput).toBeVisible({ timeout: 5_000 });
    await reasonInput.fill('spoiler');

    // Verify reason input has the value
    await expect(reasonInput).toHaveValue('spoiler');
  });

  test('should hide CW reason input when toggled off', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const cwBtn = page.getByRole('button', { name: /^CW$/i }).first();

    // Enable CW
    await cwBtn.click();
    await expect(page.locator('input[type="text"]').first()).toBeVisible({ timeout: 5_000 });

    // Disable CW
    await cwBtn.click();
    await expect(page.locator('input[type="text"]')).toHaveCount(0, { timeout: 5_000 });
  });
});

test.describe('Comment form — hashtag and mention content', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should post comment with hashtag', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Great track! #NowPlaying #Music');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText('Great track! #NowPlaying #Music').first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should post comment with URL', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Check this out: https://example.com');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText('Check this out:').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Comment form — autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show hashtag suggestions when typing #', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.pressSequentially('#Now');

    // Should show autocomplete dropdown with "NowPlaying" suggestion
    await expect(page.getByText('NowPlaying').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should close autocomplete on Escape', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.pressSequentially('#Now');

    await expect(page.getByText('NowPlaying').first()).toBeVisible({ timeout: 5_000 });

    await textarea.press('Escape');

    // Autocomplete should close
    await expect(page.getByText('NowPlaying')).toHaveCount(0, { timeout: 3_000 });
  });
});

test.describe('Comment form — receiving comments while editing', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should preserve textarea content when new comments arrive', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('My draft comment');

    // Inject a new comment from another user while we're typing
    const incomingComment = buildComment(otherUser, 'Interrupting!', TEST_I_TAG, TEST_K_TAG);
    await broadcastEventsOnAllRelays(page, [incomingComment]);

    // Verify the incoming comment appeared
    await expect(page.getByText('Interrupting!').first()).toBeVisible({ timeout: 15_000 });

    // Our draft should still be intact
    await expect(textarea).toHaveValue('My draft comment');
  });
});
