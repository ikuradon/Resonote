import { expect, test } from '@playwright/test';

test.describe('Home page', () => {
  test('should display the title and subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
    // Tagline text varies by locale; just check the subtitle paragraph exists
    await expect(page.locator('h1 + p')).toBeVisible();
  });

  test('should display the header with logo link', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('header a[href="/"]');
    await expect(logo).toHaveText('Resonote');
  });

  test('should display the URL input and Go button', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await expect(input).toBeVisible();
    const button = page.locator('[data-testid="track-submit-button"]');
    await expect(button).toBeVisible();
  });

  test('should have Go button disabled when input is empty', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('[data-testid="track-submit-button"]');
    await expect(button).toBeDisabled();
  });

  test('should enable Go button when URL is entered', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    const button = page.locator('[data-testid="track-submit-button"]');
    await expect(button).toBeEnabled();
  });

  test('should display Login with Nostr button', async ({ page }) => {
    await page.goto('/');
    const loginBtn = page.locator('button:has-text("Login with Nostr")');
    await expect(loginBtn).toBeVisible();
  });

  test('should remove loading indicator after hydration', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading-indicator')).toHaveCount(0);
  });

  test('should display example chips', async ({ page }) => {
    await page.goto('/');
    // Check that example chips section is visible
    const chipsContainer = page.locator('.flex.flex-wrap.justify-center.gap-2');
    await expect(chipsContainer).toBeVisible();
    // Should have multiple example chip buttons
    const chips = chipsContainer.locator('button');
    await expect(chips).not.toHaveCount(0);
  });

  test('should display Spotify example chip', async ({ page }) => {
    await page.goto('/');
    const spotifyChip = page.locator('button:has-text("Spotify")');
    await expect(spotifyChip).toBeVisible();
  });

  test('should display YouTube example chip', async ({ page }) => {
    await page.goto('/');
    const youtubeChip = page.locator('button:has-text("YouTube")');
    await expect(youtubeChip).toBeVisible();
  });

  test('should navigate to Spotify episode when clicking Spotify chip', async ({ page }) => {
    await page.goto('/');
    const spotifyChip = page.locator('button:has-text("Spotify")');
    await spotifyChip.click();
    await expect(page).toHaveURL(/\/spotify\/episode\//);
  });

  test('should navigate to YouTube video when clicking YouTube chip', async ({ page }) => {
    await page.goto('/');
    const youtubeChip = page.locator('button:has-text("YouTube")');
    await youtubeChip.click();
    await expect(page).toHaveURL(/\/youtube\/video\//);
  });

  test('should navigate to niconico video when clicking niconico chip', async ({ page }) => {
    await page.goto('/');
    const niconicoChip = page.locator('button:has-text("ニコニコ")');
    await niconicoChip.click();
    await expect(page).toHaveURL(/\/niconico\/video\//);
  });

  test('should navigate to Podbean episode when clicking Podbean chip', async ({ page }) => {
    await page.goto('/');
    const podbeanChip = page.locator('button:has-text("Podbean")');
    await podbeanChip.click();
    await expect(page).toHaveURL(/\/podbean\/episode\//);
  });

  test('should navigate to podcast feed when clicking RSS Feed chip', async ({ page }) => {
    await page.goto('/');
    const rssChip = page.locator('button:has-text("RSS Feed")');
    await rssChip.click();
    await expect(page).toHaveURL(/\/podcast\/feed\//);
  });
});
