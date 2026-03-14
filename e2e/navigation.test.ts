import { test, expect } from '@playwright/test';

test.describe('URL input navigation', () => {
  test('should navigate to track page on valid Spotify track URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate to episode page on valid Spotify episode URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate to show page on valid Spotify show URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/show/0yTcypvuUHOiR1kJa7ihvW');
  });

  test('should navigate via Spotify URI', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('spotify:track:4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should navigate correctly with query params in URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA?si=abc123');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should submit form with Enter key', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await input.press('Enter');
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  // --- Abnormal cases ---

  test('should navigate to YouTube video page on valid YouTube URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should navigate to YouTube video page on youtu.be URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://youtu.be/dQw4w9WgXcQ');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should show error for invalid URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://www.example.com/some-page');
    await page.locator('button:has-text("Go")').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
    // Should stay on home page
    await expect(page).toHaveURL('/');
  });

  test('should show error for random text', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('not a valid url');
    await page.locator('button:has-text("Go")').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
  });

  test('should show error for unsupported Spotify type (playlist)', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    await page.locator('button:has-text("Go")').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
  });

  test('should not navigate with whitespace-only input', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('   ');
    const button = page.locator('button:has-text("Go")');
    await expect(button).toBeDisabled();
  });

  test('should trim whitespace from URL before parsing', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');
    await input.fill('  https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA  ');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should clear error when navigating successfully after error', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify or YouTube URL..."]');

    // First: invalid URL
    await input.fill('invalid-url');
    await page.locator('button:has-text("Go")').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();

    // Then: valid URL
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('button:has-text("Go")').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });
});
