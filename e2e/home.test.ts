import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('should display the title and subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
    await expect(page.locator('text=Share your thoughts on music via Nostr')).toBeVisible();
  });

  test('should display the header with logo link', async ({ page }) => {
    await page.goto('/');
    const logo = page.locator('header a[href="/"]');
    await expect(logo).toHaveText('Resonote');
  });

  test('should display the URL input and Go button', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify URL..."]');
    await expect(input).toBeVisible();
    const button = page.locator('button:has-text("Go")');
    await expect(button).toBeVisible();
  });

  test('should have Go button disabled when input is empty', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('button:has-text("Go")');
    await expect(button).toBeDisabled();
  });

  test('should enable Go button when URL is entered', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder="Paste a Spotify URL..."]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    const button = page.locator('button:has-text("Go")');
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
});
