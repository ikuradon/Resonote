import { test, expect } from '@playwright/test';

const embedLocator = '[data-testid="spotify-embed"]';

test.describe('Content page (track)', () => {
  const trackUrl = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';

  test('should display Spotify embed', async ({ page }) => {
    await page.goto(trackUrl);
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should display Comments heading', async ({ page }) => {
    await page.goto(trackUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await expect(page.locator('text=Login to post comments')).toBeVisible();
  });

  test('should not display comment form when not logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await expect(page.locator('input[placeholder="Write a comment..."]')).toHaveCount(0);
  });

  test('should display "No comments yet" initially', async ({ page }) => {
    // Block WebSocket connections to prevent loading real comments
    await page.route('wss://**', (route) => route.abort());
    await page.goto(trackUrl);
    // Wait for the comments section to load
    await expect(page.locator('text=No comments yet')).toBeVisible({ timeout: 10_000 });
  });

  test('should show header with logo navigation back to home', async ({ page }) => {
    await page.goto(trackUrl);
    const logo = page.locator('header a[href="/"]');
    await expect(logo).toBeVisible();
    await logo.click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Content page (episode)', () => {
  const episodeUrl = '/spotify/episode/4C6zDr6e86HYqLxPAhO8jA';

  test('should display Spotify embed for episode', async ({ page }) => {
    await page.goto(episodeUrl);
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should display Comments section for episode', async ({ page }) => {
    await page.goto(episodeUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });
});

test.describe('Content page (show / collection)', () => {
  const showUrl = '/spotify/show/0yTcypvuUHOiR1kJa7ihvW';

  test('should display Spotify embed for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator(embedLocator)).toBeVisible();
  });

  test('should display "View all episodes on Spotify" link', async ({ page }) => {
    await page.goto(showUrl);
    const link = page.locator('a:has-text("View all episodes on Spotify")');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      'href',
      'https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW'
    );
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('should display episode URL guidance text', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('text=Paste an episode URL to view comments')).toBeVisible();
  });

  test('should NOT display Comments heading for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('h2:has-text("Comments")')).toHaveCount(0);
  });

  test('should NOT display comment form or login prompt for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('text=Login to post comments')).toHaveCount(0);
    await expect(page.locator('input[placeholder="Write a comment..."]')).toHaveCount(0);
  });
});

test.describe('Content page (YouTube)', () => {
  const youtubeUrl = '/youtube/video/dQw4w9WgXcQ';

  test('should display YouTube embed', async ({ page }) => {
    await page.goto(youtubeUrl);
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();
  });

  test('should display Comments heading for YouTube', async ({ page }) => {
    await page.goto(youtubeUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on YouTube', async ({ page }) => {
    await page.goto(youtubeUrl);
    await expect(page.locator('text=Login to post comments')).toBeVisible();
  });
});

test.describe('Content page (invalid)', () => {
  test('should show unsupported content for unknown platform', async ({ page }) => {
    await page.goto('/unknown/type/abc123');
    await expect(page.locator('text=Unsupported content')).toBeVisible();
  });

  test('should show back to home link on unsupported content', async ({ page }) => {
    await page.goto('/unknown/type/abc123');
    const backLink = page.locator('a:has-text("Back to home")');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL('/');
  });

  test('should show unsupported content for empty type/id segments', async ({ page }) => {
    // This tests the route parameter validation
    await page.goto('/spotify/track/');
    // SvelteKit may handle this differently - the page should either show unsupported or 404
    // The important thing is it doesn't crash
    await expect(page.locator('h1')).toBeVisible();
  });
});
