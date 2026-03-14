import { test, expect } from '@playwright/test';

const embedLocator = '[data-testid="spotify-embed"]';

test.describe('Resilience', () => {
  test('should handle XSS-like input safely', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('<script>alert("xss")</script>');
    await page.locator('button:has-text("Go")').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
    // Verify no script execution - page should still be functional
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should handle very long URL input without crashing', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    const longUrl = 'https://open.spotify.com/track/' + 'a'.repeat(1000);
    await input.fill(longUrl);
    await page.locator('button:has-text("Go")').click();
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
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');

    // Navigate to track
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('button:has-text("Go")').click();
    // Immediately go back and navigate to something else
    await page.locator('header a[href="/"]').click();
    await page
      .locator('input[placeholder="Paste a Spotify or YouTube URL..."]')
      .fill('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('button:has-text("Go")').click();
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
});
