/**
 * E2E tests for additional edge cases, error states, and miscellaneous scenarios.
 * Covers sections 37, 40 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import {
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

test.describe('Unsupported content', () => {
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

  test('should handle empty type/id segments gracefully', async ({ page }) => {
    await page.goto('/spotify/track/');
    // SvelteKit may redirect to /spotify/track or show the page — just verify no crash
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });
});

test.describe('SPA fallback', () => {
  test('should handle completely unknown route', async ({ page }) => {
    await page.goto('/this/route/does/not/exist/at/all');
    // SPA fallback serves index.html
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });
});

test.describe('Spotify show page specifics', () => {
  const showUrl = '/spotify/show/0yTcypvuUHOiR1kJa7ihvW';

  test('should show "View all episodes" link', async ({ page }) => {
    await page.goto(showUrl);
    const link = page.locator('[data-testid="show-episodes-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('should show paste hint text', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('[data-testid="show-paste-hint"]')).toBeVisible();
  });

  test('should NOT show Comments heading for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('h2:has-text("Comments")')).toHaveCount(0);
  });

  test('should NOT show comment form or login prompt for show', async ({ page }) => {
    await page.goto(showUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toHaveCount(0);
  });
});

test.describe('Content page — comment form edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should not show comment form on podcast feed page', async ({ page }) => {
    const feedUrl = '/podcast/feed/aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA';
    await page.goto(feedUrl);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="feed-comment-hint"]')).toBeVisible();
    await expect(page.locator('[data-testid="comment-form"]')).toHaveCount(0);
  });
});

test.describe('Environment and relay status', () => {
  test('should show relay status indicator when logged in (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Relay status should show connected count (e.g., "4/4")
    await expect(page.locator('text=/\\d+\\/\\d+/').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Embed data-testid attributes', () => {
  test('should have data-testid on Spotify embed', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
  });

  test('should have data-testid on YouTube embed', async ({ page }) => {
    await page.goto('/youtube/video/dQw4w9WgXcQ');
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();
  });

  test('should have data-testid on Niconico embed', async ({ page }) => {
    await page.goto('/niconico/video/sm9');
    await expect(page.locator('[data-testid="niconico-embed"]')).toBeVisible();
  });

  test('should have data-testid on Audio embed', async ({ page }) => {
    await page.goto('/audio/track/aHR0cHM6Ly9leGFtcGxlLmNvbS90ZXN0Lm1wMw');
    await expect(page.locator('[data-testid="audio-embed"]')).toBeVisible();
  });

  test('should have data-testid on Podbean embed', async ({ page }) => {
    await page.goto('/podbean/episode/pb-ar8ve-1920b14');
    await expect(page.locator('[data-testid="podbean-embed"]')).toBeVisible();
  });

  test('should have data-testid on Vimeo embed', async ({ page }) => {
    await page.goto('/vimeo/video/76979871');
    await expect(page.locator('[data-testid="vimeo-embed"]')).toBeVisible();
  });

  test('should have data-testid on SoundCloud embed', async ({ page }) => {
    await page.goto('/soundcloud/track/user%2Ftrack-name');
    await expect(page.locator('[data-testid="soundcloud-embed"]')).toBeVisible({ timeout: 20_000 });
  });

  test('should have data-testid on Mixcloud embed', async ({ page }) => {
    await page.goto('/mixcloud/mix/user%2Fmix-name');
    await expect(page.locator('[data-testid="mixcloud-embed"]')).toBeVisible();
  });

  test('should have data-testid on Spreaker embed', async ({ page }) => {
    await page.goto('/spreaker/episode/12345678');
    await expect(page.locator('[data-testid="spreaker-embed"]')).toBeVisible();
  });
});

test.describe('Header navigation', () => {
  test('should navigate home via logo from content page', async ({ page }) => {
    await page.goto(TEST_TRACK_URL);
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('Resonote');
  });

  test('should navigate home via logo from settings', async ({ page }) => {
    await page.goto('/settings');
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Content page with query parameter', () => {
  test('should render content page with ?t= parameter', async ({ page }) => {
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA?t=90');
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should render YouTube page with ?t= parameter', async ({ page }) => {
    await page.goto('/youtube/video/dQw4w9WgXcQ?t=30');
    await expect(page.locator('[data-testid="youtube-embed"]')).toBeVisible();
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });
});
