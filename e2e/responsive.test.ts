import { test, expect } from '@playwright/test';

const embedLocator = '[data-testid="spotify-embed"]';

test.describe('Responsive layout', () => {
  test('should display correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
    await expect(page.locator('[data-testid="track-url-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="track-submit-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
  });

  test('should navigate on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should display content page on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator(embedLocator)).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });

  test('should display show page correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/spotify/show/0yTcypvuUHOiR1kJa7ihvW');
    await expect(page.locator('[data-testid="show-episodes-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="show-paste-hint"]')).toBeVisible();
  });

  test('should display correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
    await expect(page.locator('[data-testid="track-url-input"]')).toBeVisible();
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/');
    // Tab to input
    await page.keyboard.press('Tab');
    // Tab should eventually reach the URL input
    const input = page.locator('[data-testid="track-url-input"]');
    // Fill and submit with Enter
    await input.fill('https://open.spotify.com/track/4C6zDr6e86HYqLxPAhO8jA');
    await input.press('Enter');
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });
});
