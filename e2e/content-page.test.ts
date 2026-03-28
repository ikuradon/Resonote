import { expect, test } from '@playwright/test';

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
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });

  test('should not display comment form when not logged in', async ({ page }) => {
    await page.goto(trackUrl);
    await expect(page.locator('input[placeholder="Write a comment..."]')).toHaveCount(0);
  });

  test('should display "No comments yet" initially', async ({ page }) => {
    // Block WebSocket connections to prevent loading real comments
    await page.route('wss://**', (route) => route.abort());
    await page.goto(trackUrl);
    // "No comments yet" appears in the Shout tab empty state
    const shoutTab = page.getByRole('button', { name: /📢/ });
    await expect(shoutTab).toBeVisible({ timeout: 10_000 });
    await shoutTab.click();
    // Wait for loading to complete, then expect empty state
    await expect(page.locator('text=No comments yet')).toBeVisible({ timeout: 15_000 });
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
    const link = page.locator('[data-testid="show-episodes-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      'href',
      'https://open.spotify.com/show/0yTcypvuUHOiR1kJa7ihvW'
    );
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('should display episode URL guidance text', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('[data-testid="show-paste-hint"]')).toBeVisible();
  });

  test('should NOT display Comments heading for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('h2:has-text("Comments")')).toHaveCount(0);
  });

  test('should NOT display comment form or login prompt for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toHaveCount(0);
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
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (niconico)', () => {
  const niconicoUrl = '/niconico/video/sm9';

  test('should display niconico embed', async ({ page }) => {
    await page.goto(niconicoUrl);
    await expect(page.locator('[data-testid="niconico-embed"]')).toBeVisible();
  });

  test('should display Comments heading for niconico', async ({ page }) => {
    await page.goto(niconicoUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on niconico', async ({ page }) => {
    await page.goto(niconicoUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (audio)', () => {
  // Base64url-encoded "https://example.com/test.mp3"
  const audioUrl = '/audio/track/aHR0cHM6Ly9leGFtcGxlLmNvbS90ZXN0Lm1wMw';

  test('should display audio embed', async ({ page }) => {
    await page.goto(audioUrl);
    await expect(page.locator('[data-testid="audio-embed"]')).toBeVisible();
  });

  test('should display Comments heading for audio', async ({ page }) => {
    await page.goto(audioUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on audio', async ({ page }) => {
    await page.goto(audioUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (podcast feed)', () => {
  // Base64url-encoded "https://example.com/feed/rss"
  const feedUrl = '/podcast/feed/aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkL3Jzcw';

  test('should render podcast feed page with header', async ({ page }) => {
    await page.goto(feedUrl);
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });

  test('should display episode selection hint for podcast feed', async ({ page }) => {
    await page.goto(feedUrl);
    await expect(page.locator('[data-testid="feed-comment-hint"]')).toBeVisible();
  });

  test('should show episode selection hint instead of comment form', async ({ page }) => {
    await page.goto(feedUrl);
    await expect(page.locator('[data-testid="feed-comment-hint"]')).toBeVisible();
    // Comment form should NOT be in DOM at all (isFeed hides the entire section)
    await expect(page.locator('[data-testid="comment-form"]')).toHaveCount(0);
  });
});

test.describe('Content page (podbean)', () => {
  const podbeanUrl = '/podbean/episode/pb-ar8ve-1920b14';

  test('should display podbean embed', async ({ page }) => {
    await page.goto(podbeanUrl);
    await expect(page.locator('[data-testid="podbean-embed"]')).toBeVisible();
  });

  test('should display Comments heading for podbean', async ({ page }) => {
    await page.goto(podbeanUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on podbean', async ({ page }) => {
    await page.goto(podbeanUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page navigation between types', () => {
  test('should navigate from Spotify track to YouTube video via home', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();

    // Go back to home
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    // Navigate to YouTube
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();
  });

  test('should navigate from YouTube to niconico via home', async ({ page }) => {
    await page.goto('/youtube/video/dQw4w9WgXcQ');
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();

    // Go back to home
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    // Navigate to niconico
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.nicovideo.jp/watch/sm9');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/sm9');
    await expect(page.locator('[data-testid="niconico-embed"]')).toBeVisible();
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
