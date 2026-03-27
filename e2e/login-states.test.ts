/**
 * E2E tests for authentication state matrix.
 * Covers: not-logged-in, full login, read-only login × various pages.
 */
import { expect, type Page, test } from '@playwright/test';

import {
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

// ---------------------------------------------------------------------------
// Helper for read-only login (no signEvent)
// ---------------------------------------------------------------------------
async function simulateReadOnlyLogin(page: Page, pubkey: string): Promise<void> {
  await page.evaluate(async (pk: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).nostr = { getPublicKey: async () => pk };
    document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
  }, pubkey);
}

// ---------------------------------------------------------------------------
// Content page × auth states
// ---------------------------------------------------------------------------

test.describe('Content page — not logged in', () => {
  test('should show login prompt', async ({ page }) => {
    await setupMockPool(page);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });

  test('should hide comment form', async ({ page }) => {
    await setupMockPool(page);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="comment-form"]')).toHaveCount(0);
  });

  test('should show share button in Info tab (copy only)', async ({ page }) => {
    await setupMockPool(page);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    await expect(page.getByRole('button', { name: /Share|共有/i })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should hide bookmark button', async ({ page }) => {
    await setupMockPool(page);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Open Info tab — bookmark button should not appear for unauthenticated users
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    await expect(page.getByRole('button', { name: /Bookmark|ブックマーク/i })).toHaveCount(0);
  });

  test('should hide filter bar', async ({ page }) => {
    await setupMockPool(page);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Filter is now a <select> dropdown, only shown when logged in
    await expect(page.locator('select')).toHaveCount(0);
  });
});

test.describe('Content page — full login', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should show comment form after login', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await expect(page.locator('[data-testid="comment-form"]')).toBeVisible({ timeout: 10_000 });
  });

  test('should show bookmark button in Info tab', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Bookmark button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    await expect(page.getByRole('button', { name: /Bookmark|ブックマーク/i })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show filter dropdown', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Filter is now a <select> dropdown
    await expect(page.locator('select').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show "Post to Nostr" in share menu', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Share button is inside the Info tab
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();

    await page.getByRole('button', { name: /Share|共有/i }).click();
    await expect(page.getByText(/Post to Nostr|Nostrに投稿/).first()).toBeVisible({
      timeout: 5_000
    });
  });
});

test.describe('Content page — read-only login', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
  });

  test('should show comment form (textarea visible)', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateReadOnlyLogin(page, user.pubkey);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  });

  test('should show filter dropdown', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateReadOnlyLogin(page, user.pubkey);

    // Filter is now a <select> dropdown
    await expect(page.locator('select').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Settings page × auth states
// ---------------------------------------------------------------------------

test.describe('Settings page — not logged in', () => {
  test('should display mute section', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Mute|ミュート/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should display notification filter', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^All$|^全員$/ })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should display developer tools', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Developer|開発/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Settings page — read-only login', () => {
  test('should show NIP-44 warning', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateReadOnlyLogin(page, user.pubkey);
    await expect(page.locator('text=NIP-44')).toBeVisible({ timeout: 10_000 });
  });

  test('should show relay heading', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateReadOnlyLogin(page, user.pubkey);
    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Relays|リレー/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Bookmarks page × auth states
// ---------------------------------------------------------------------------

test.describe('Bookmarks page — not logged in', () => {
  test('should show login prompt', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/bookmarks');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Login to post|ログインして/).first()).toBeVisible({
      timeout: 10_000
    });
  });
});

test.describe('Bookmarks page — full login', () => {
  test('should show bookmarks page with empty state', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/bookmarks');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await expect(page.getByText(/No bookmarks|ブックマークはまだ/).first()).toBeVisible({
      timeout: 10_000
    });
  });
});

// ---------------------------------------------------------------------------
// Notifications page × auth states
// ---------------------------------------------------------------------------

test.describe('Notifications page — not logged in', () => {
  test('should show login prompt', async ({ page }) => {
    await setupMockPool(page);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Login to post|ログインして/).first()).toBeVisible({
      timeout: 10_000
    });
  });
});

test.describe('Notifications page — full login', () => {
  test('should show notifications title', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await expect(page.locator('h1').filter({ hasText: /Notifications|通知/ })).toBeVisible({
      timeout: 10_000
    });
  });

  test('should show empty state when no notifications', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await expect(page.getByText(/No notifications|通知はまだ/).first()).toBeVisible({
      timeout: 10_000
    });
  });
});

// ---------------------------------------------------------------------------
// Profile page × auth states
// ---------------------------------------------------------------------------

test.describe('Profile page — not logged in', () => {
  test('should display profile page without login', async ({ page }) => {
    await setupMockPool(page);
    const npub = `npub1${'q'.repeat(58)}`;
    await page.goto(`/profile/${npub}`);
    await page.waitForLoadState('networkidle');
    // Should render the page shell (header)
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });

  test('should not show follow/mute buttons', async ({ page }) => {
    await setupMockPool(page);
    const npub = `npub1${'q'.repeat(58)}`;
    await page.goto(`/profile/${npub}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Follow|フォロー/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Mute|ミュート/i })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Login/logout transitions
// ---------------------------------------------------------------------------

test.describe('Login/logout transitions', () => {
  test('should show login button → login → show logout button', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Before login
    await expect(
      page.locator('button:has-text("Login with Nostr"), button:has-text("Nostrでログイン")')
    ).toBeVisible({ timeout: 10_000 });

    await simulateLogin(page);

    // After login
    await expect(
      page.locator('button:has-text("Logout"), button:has-text("ログアウト")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should restore login prompt after logout', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Logout
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'logout' } }));
    });

    await expect(
      page.locator('button:has-text("Login with Nostr"), button:has-text("Nostrでログイン")')
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should hide comment form after logout', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.locator('[data-testid="comment-form"]')).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'logout' } }));
    });

    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible({
      timeout: 10_000
    });
  });
});

test.describe('Logout UI transitions', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should hide filter dropdown after logout', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Filter is now a <select> dropdown
    await expect(page.locator('select').first()).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'logout' } }));
    });

    await expect(page.locator('select')).toHaveCount(0, { timeout: 10_000 });
  });

  test('should hide bookmark button after logout', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Open Info tab to see bookmark button
    await page.locator('button').filter({ hasText: /ℹ️/ }).first().click();
    await expect(page.getByRole('button', { name: /Bookmark|ブックマーク/i })).toBeVisible({
      timeout: 10_000
    });

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'logout' } }));
    });

    await expect(page.getByRole('button', { name: /Bookmark|ブックマーク/i })).toHaveCount(0, {
      timeout: 10_000
    });
  });
});
