import { test, expect } from '@playwright/test';
import { startMockServer, type MockServer } from './helpers/mock-server.js';

let mock: MockServer;

test.beforeAll(async () => {
  mock = await startMockServer();
});

test.afterAll(async () => {
  await mock.close();
});

test.describe('URL input navigation', () => {
  test('should navigate to track page on valid Spotify track URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate to episode page on valid Spotify episode URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate to show page on valid Spotify show URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/show/0yTcypvuUHOiR1kJa7ihvW');
  });

  test('should navigate via Spotify URI', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('spotify:track:4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate correctly with query params in URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA?si=abc123');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should submit form with Enter key', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await input.press('Enter');
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  // --- Abnormal cases ---

  test('should navigate to YouTube video page on valid YouTube URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should navigate to YouTube video page on youtu.be URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://youtu.be/dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should navigate to resolve page for unknown URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.example.com/some-page');
    await page.locator('[data-testid="track-submit-button"]').click();
    // Unknown URLs are sent to the resolve page for auto-discovery
    await expect(page).toHaveURL(/\/resolve\//);
  });

  test('should navigate to resolve page for unsupported Spotify type (playlist)', async ({
    page
  }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/resolve\//);
  });

  test('should not navigate with whitespace-only input', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('   ');
    const button = page.locator('[data-testid="track-submit-button"]');
    await expect(button).toBeDisabled();
  });

  test('should trim whitespace from URL before parsing', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('  https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA  ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate to resolve page for unknown domain', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('invalid-url');
    await page.locator('[data-testid="track-submit-button"]').click();
    // Domain-like text is sent to resolve page for auto-discovery
    await expect(page).toHaveURL(/\/resolve\//);
  });

  test('should navigate to resolve page and show loading then error for unknown URL', async ({
    page
  }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    // Use mock server with unknown path to avoid external network dependency
    await input.fill(`${mock.url}/unknown-content`);
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/resolve\//);
    // Mock server returns 404 for unknown paths → API returns fetch_failed (non-OK response)
    await expect(
      page.locator('text=No podcast found at this URL').or(page.locator('text=Failed to resolve'))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to podcast feed page for RSS feed URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/feed/rss');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/podcast\/feed\//);
  });

  test('should navigate to podcast feed page for XML extension URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/podcast.xml');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/podcast\/feed\//);
  });

  test('should navigate to niconico page for sm-prefix URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.nicovideo.jp/watch/sm9');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/sm9');
  });

  test('should navigate to niconico page for so-prefix URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.nicovideo.jp/watch/so12345');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/so12345');
  });

  test('should navigate to niconico page for nico.ms short URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://nico.ms/sm9');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/sm9');
  });

  test('should navigate to podbean page for share URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.podbean.com/media/share/pb-ar8ve-1920b14');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/podbean/episode/pb-ar8ve-1920b14');
  });

  test('should navigate to podbean page for channel URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://mypodcast.podbean.com/e/my-episode');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/podbean\/episode\//);
  });

  test('should navigate to audio page for .mp3 URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.mp3');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });

  test('should navigate to audio page for .m4a URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.m4a');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });
});
