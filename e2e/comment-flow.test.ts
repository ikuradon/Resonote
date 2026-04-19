import { finalizeEvent, generateSecretKey, getPublicKey } from '@auftakt/core';
import { expect, test } from '@playwright/test';

import { setupFullLogin, setupMockPool, simulateLogin } from './helpers/e2e-setup.js';

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);

test.describe('Comment flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
  });

  test('should post a comment and display it', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Switch to Shout tab so the comment appears as a general comment
    const shoutTab = page.getByRole('button', { name: /📢/ });
    await expect(shoutTab).toBeVisible({ timeout: 10_000 });
    await shoutTab.click();

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill('Hello from E2E test!');
    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeVisible();
    await sendButton.click();

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText('Hello from E2E test!').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should clear textarea after successful send', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill('Clear test');
    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    await expect(textarea).toHaveValue('', { timeout: 10_000 });
  });
});

test.describe('Read-only login', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    // No setupFullLogin — read-only mode has no signEvent
  });

  test('should show comment form after read-only login', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');

    await page.evaluate(async (pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = { getPublicKey: async () => pubkey };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, testPubkey);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test('should show NIP-44 warning on settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async (pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = { getPublicKey: async () => pubkey };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, testPubkey);

    const nip44Warning = page.locator('text=NIP-44');
    await expect(nip44Warning).toBeVisible({ timeout: 10_000 });
  });

  test('should show relay heading on settings page after login', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await page.evaluate(async (pubkey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = { getPublicKey: async () => pubkey };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, testPubkey);

    const relayHeading = page
      .locator('h2')
      .filter({ hasText: /Relays|リレー/ })
      .first();
    await expect(relayHeading).toBeVisible({ timeout: 10_000 });
  });
});
