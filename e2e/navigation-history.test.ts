/**
 * E2E tests for SPA navigation history, reloads, and deep links.
 * Extends direct-access.test.ts and resilience.test.ts with additional patterns.
 */
import { expect, test } from '@playwright/test';

test.describe('Multi-step navigation history', () => {
  test('should handle Home → Content → Settings → Back → Content → Back → Home', async ({
    page
  }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');

    // Navigate to content
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');

    // Navigate to settings via direct URL (simulating nav link)
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');

    // Back to content
    await page.goBack();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');

    // Back to home
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('should handle Home → Bookmarks → Home → Notifications → Home', async ({ page }) => {
    await page.goto('/');

    await page.goto('/bookmarks');
    await expect(page).toHaveURL('/bookmarks');

    await page.goBack();
    await expect(page).toHaveURL('/');

    await page.goto('/notifications');
    await expect(page).toHaveURL('/notifications');

    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('should handle 5 rapid navigations and end on correct page', async ({ page }) => {
    await page.goto('/');
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.goto('/youtube/video/dQw4w9WgXcQ');
    await page.goto('/settings');
    await page.goto('/niconico/video/sm9');

    await expect(page).toHaveURL('/niconico/video/sm9');
    await expect(page.locator('[data-testid="niconico-embed"]')).toBeVisible();
  });

  test('should handle back 5 times from deep navigation', async ({ page }) => {
    await page.goto('/');
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.goto('/youtube/video/dQw4w9WgXcQ');
    await page.goto('/settings');
    await page.goto('/niconico/video/sm9');

    await page.goBack(); // → settings
    await page.goBack(); // → youtube
    await page.goBack(); // → spotify
    await page.goBack(); // → home
    await expect(page).toHaveURL('/');
  });
});

test.describe('Reload on various pages', () => {
  test('should preserve URL on Settings reload', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');
    await page.reload();
    await expect(page).toHaveURL('/settings');
  });

  test('should preserve URL on Bookmarks reload', async ({ page }) => {
    await page.goto('/bookmarks');
    await expect(page).toHaveURL('/bookmarks');
    await page.reload();
    await expect(page).toHaveURL('/bookmarks');
  });

  test('should preserve URL on Notifications reload', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page).toHaveURL('/notifications');
    await page.reload();
    await expect(page).toHaveURL('/notifications');
  });

  test('should preserve embed on Vimeo reload', async ({ page }) => {
    await page.goto('/vimeo/video/76979871');
    await expect(page.locator('[data-testid="vimeo-embed"]')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL('/vimeo/video/76979871');
    await expect(page.locator('[data-testid="vimeo-embed"]')).toBeVisible();
  });

  test('should preserve embed on Podbean reload', async ({ page }) => {
    await page.goto('/podbean/episode/pb-ar8ve-1920b14');
    await expect(page.locator('[data-testid="podbean-embed"]')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL('/podbean/episode/pb-ar8ve-1920b14');
    await expect(page.locator('[data-testid="podbean-embed"]')).toBeVisible();
  });
});

test.describe('Deep link direct access — additional platforms', () => {
  test('should render Vimeo page on direct access', async ({ page }) => {
    await page.goto('/vimeo/video/76979871');
    await expect(page.locator('[data-testid="vimeo-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should render Mixcloud page on direct access', async ({ page }) => {
    await page.goto('/mixcloud/mix/user%2Fmix-name');
    await expect(page.locator('[data-testid="mixcloud-embed"]')).toBeVisible();
  });

  test('should render Spreaker page on direct access', async ({ page }) => {
    await page.goto('/spreaker/episode/12345678');
    await expect(page.locator('[data-testid="spreaker-embed"]')).toBeVisible();
  });

  test('should render SoundCloud page on direct access', async ({ page }) => {
    await page.goto('/soundcloud/track/user%2Ftrack-name');
    await expect(page.locator('[data-testid="soundcloud-embed"]')).toBeVisible({ timeout: 20_000 });
  });

  test('should render settings on direct access without login', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Mute|ミュート/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Content page with query parameter', () => {
  test('should render content page with ?t= parameter', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA?t=90');
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });
});
