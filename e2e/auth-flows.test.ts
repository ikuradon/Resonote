import { finalizeEvent, generateSecretKey, getPublicKey } from '@auftakt/core';
import { expect, test } from '@playwright/test';

import {
  buildMetadata,
  preloadEvents,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  type TestIdentity
} from './helpers/e2e-setup.js';

const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';
const sk = generateSecretKey();
const testPubkey = getPublicKey(sk);
const testIdentity: TestIdentity = {
  sk,
  pubkey: testPubkey,
  sign: (event) => finalizeEvent(event, sk)
};

test.describe('Authenticated flows', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
  });

  test('should show comment form after login', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test('should show send button when text is entered', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Test comment');

    const sendButton = page.locator('button[type="submit"]');
    await expect(sendButton).toBeVisible();
  });

  test('should show logout button when logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const logoutButton = page.getByRole('button', { name: /Logout|ログアウト/i });
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });
  });

  test('should logout and show login prompt', async ({ page }) => {
    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const logoutButton = page.getByRole('button', { name: /Logout|ログアウト/i });
    await expect(logoutButton).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'logout' } }));
    });

    await expect(
      page.locator('button:has-text("Login with Nostr"), button:has-text("Nostrでログイン")')
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Navbar avatar hydration', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, testPubkey, (event) => finalizeEvent(event, sk));
  });

  test('should hydrate navbar avatar with metadata picture after login', async ({ page }) => {
    const validImage = 'https://cdn.test/avatar-a.png';

    // Intercept the image request and return a valid 1x1 PNG
    await page.route(validImage, async (route) => {
      const buffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      );
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: buffer
      });
    });

    const metadata = buildMetadata(testIdentity, {
      name: 'AvatarUser',
      picture: validImage
    });
    await preloadEvents(page, [metadata]);

    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const avatarImage = page.locator('[data-testid="navbar-avatar-image"]');
    await expect(avatarImage).toBeVisible({ timeout: 10_000 });
    await expect(avatarImage).toHaveAttribute('src', validImage);

    const avatarFallback = page.locator('[data-testid="navbar-avatar-fallback"]');
    await expect(avatarFallback).toHaveCount(0);
  });

  test('should keep fallback avatar when metadata picture is missing', async ({ page }) => {
    const metadata = buildMetadata(testIdentity, {
      name: 'NoPicUser'
    });
    await preloadEvents(page, [metadata]);

    await page.goto(trackUrl);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    const avatarFallback = page.locator('[data-testid="navbar-avatar-fallback"]');
    await expect(avatarFallback).toBeVisible({ timeout: 10_000 });
    await expect(avatarFallback).toHaveAttribute('src', /stellarid/);

    const avatarImage = page.locator('[data-testid="navbar-avatar-image"]');
    await expect(avatarImage).toHaveCount(0);
  });
});
