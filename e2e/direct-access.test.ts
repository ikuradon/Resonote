import { test, expect } from '@playwright/test';

const embedLocator = '[data-testid="spotify-embed"]';

test.describe('Direct URL access (SPA fallback)', () => {
  test('should render track page on direct access', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should render episode page on direct access', async ({ page }) => {
    await page.goto('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should render show page on direct access', async ({ page }) => {
    await page.goto('/spotify/show/0yTcypvuUHOiR1kJa7ihvW');
    await expect(page.locator('a:has-text("View all episodes on Spotify")')).toBeVisible();
  });

  test('should render YouTube video page on direct access', async ({ page }) => {
    await page.goto('/youtube/video/dQw4w9WgXcQ');
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should render home page on direct access', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should handle unknown routes gracefully (SPA fallback)', async ({ page }) => {
    await page.goto('/completely/unknown/route');
    // SPA fallback serves 200.html, so the app should load
    // It should either show the home page or an error state, but not crash
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Client-side navigation', () => {
  test('should navigate from home to track and back', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();

    // Navigate back via logo
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should navigate between different content pages via home', async ({ page }) => {
    // Go to track
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');

    // Go back to home
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    // Go to show
    await page
      .locator('[data-testid="track-url-input"]')
      .fill('https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/show/0yTcypvuUHOiR1kJa7ihvW');
    await expect(page.locator('a:has-text("View all episodes on Spotify")')).toBeVisible();
  });

  test('should handle browser back/forward navigation', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');

    // Browser back
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Browser forward
    await page.goForward();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });
});
