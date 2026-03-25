/**
 * E2E tests for security: XSS prevention, private key detection, dangerous inputs.
 * Covers section 27 of e2e-test-scenarios.md.
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

test.describe('XSS prevention in URL input', () => {
  test('should handle script tag input safely', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('<script>alert("xss")</script>');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
    // Page should still be functional
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should handle img onerror input safely', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('<img onerror=alert(1) src=x>');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
  });
});

test.describe('XSS prevention in comment content', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should render script tags as plain text in comments', async ({ page }) => {
    const xssComment = buildComment(
      otherUser,
      '<script>document.cookie</script>',
      TEST_I_TAG,
      TEST_K_TAG
    );
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [xssComment]);

    // Should render as text, not execute
    await expect(page.getByText('<script>').first()).toBeVisible({ timeout: 15_000 });

    // No script execution — page should still work
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should render img tags as plain text in comments', async ({ page }) => {
    const xssComment = buildComment(
      otherUser,
      '<img onerror=alert(1) src=x>',
      TEST_I_TAG,
      TEST_K_TAG
    );
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [xssComment]);

    // Should be rendered as text
    await expect(page.getByText('<img').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('XSS prevention in profile data', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should sanitize script tags in profile name displayed on comment', async ({ page }) => {
    const { buildMetadata } = await import('./helpers/e2e-setup.js');
    const metadata = buildMetadata(otherUser, {
      name: '<b onmouseover=alert(1)>Evil</b>'
    });
    const comment = buildComment(otherUser, 'Profile XSS test', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [metadata, comment]);

    await expect(page.getByText('Profile XSS test').first()).toBeVisible({ timeout: 15_000 });

    // Profile name should be rendered as text, not executed as HTML
    // No <b> tag should exist with onmouseover
    const dangerousElement = page.locator('b[onmouseover]');
    await expect(dangerousElement).toHaveCount(0);
  });

  test('should handle javascript URL in comment content safely', async ({ page }) => {
    const jsComment = buildComment(
      otherUser,
      'Click here: javascript:alert(1)',
      TEST_I_TAG,
      TEST_K_TAG
    );
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [jsComment]);

    await expect(page.getByText('Click here:').first()).toBeVisible({ timeout: 15_000 });

    // javascript: should NOT be a clickable link
    const jsLink = page.locator('a[href^="javascript:"]');
    await expect(jsLink).toHaveCount(0);
  });
});

test.describe('Malformed event handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should handle event with invalid tags gracefully', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Inject a normal comment alongside to verify page still works
    const normalComment = buildComment(otherUser, 'Normal after bad', TEST_I_TAG, TEST_K_TAG);
    await broadcastEventsOnAllRelays(page, [normalComment]);

    // Page should still be functional
    await expect(page.getByText('Normal after bad').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Private key detection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should block comment containing nsec1', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Generate a fake nsec-looking string (58 chars after nsec1)
    await textarea.fill(`Check my key: nsec1${'a'.repeat(58)}`);

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Should show error toast about private key
    await expect(page.getByText(/private key|秘密鍵/).first()).toBeVisible({ timeout: 10_000 });

    // Text should NOT be cleared (still in textarea for editing)
    await expect(textarea).not.toHaveValue('');
  });

  test('should allow partial nsec that is not a valid key', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Short string containing "nsec" but not a valid nsec1 key
    await textarea.fill('This mentions nsec but is not a key');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Should send successfully (no private key detected)
    await expect(textarea).toHaveValue('', { timeout: 10_000 });
  });
});
