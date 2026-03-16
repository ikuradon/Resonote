import { test, expect } from '@playwright/test';

const embedLocator = '[data-testid="spotify-embed"]';

test.describe('Resilience', () => {
  test('should handle XSS-like input safely', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('<script>alert("xss")</script>');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
    // Verify no script execution - page should still be functional
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should handle very long URL input without crashing', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    const longUrl = 'https://open.spotify.com/track/' + 'a'.repeat(1000);
    await input.fill(longUrl);
    await page.locator('[data-testid="track-submit-button"]').click();
    // Should navigate (the regex will match the long ID)
    await expect(page).toHaveURL(new RegExp('/spotify/track/a+'));
  });

  test('should handle page reload on content page', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
    // Reload
    await page.reload();
    await expect(page.locator(embedLocator)).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should handle rapid successive navigations', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');

    // Navigate to track
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    // Immediately go back and navigate to something else
    await page.locator('header a[href="/"]').click();
    await page
      .locator('[data-testid="track-url-input"]')
      .fill('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should handle direct navigation between content pages', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
    // Navigate directly to a different content page
    await page.goto('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should gracefully handle WebSocket failure', async ({ page }) => {
    // Block all WebSocket connections
    await page.route('wss://**', (route) => route.abort());
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    // Page should still render without crashing
    await expect(page.locator(embedLocator)).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should maintain URL after page reload on content page', async ({ page }) => {
    const contentUrl = '/youtube/video/dQw4w9WgXcQ';
    await page.goto(contentUrl);
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();

    // Reload and verify URL is preserved
    await page.reload();
    await expect(page).toHaveURL(contentUrl);
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should maintain URL after page reload on niconico page', async ({ page }) => {
    const contentUrl = '/niconico/video/sm9';
    await page.goto(contentUrl);
    await expect(page.locator('[data-testid="niconico-embed"]')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(contentUrl);
    await expect(page.locator('[data-testid="niconico-embed"]')).toBeVisible();
  });

  test('should handle back/forward navigation between different content types', async ({
    page
  }) => {
    // Start at home
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');

    // Navigate to Spotify track
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');

    // Go back to home
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Navigate to YouTube
    await page
      .locator('[data-testid="track-url-input"]')
      .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');

    // Go back to home
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Go forward to YouTube
    await page.goForward();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should handle reload on home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');

    await page.reload();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
    await expect(page.locator('[data-testid="track-url-input"]')).toBeVisible();
  });
});
