/**
 * E2E tests for platform-specific embed pages that are not covered
 * by content-page.test.ts (which covers Spotify, YouTube, Niconico, Audio, Podbean).
 */
import { expect, test } from '@playwright/test';

import { setupMockPool } from './helpers/e2e-setup.js';

test.describe('Content page (Vimeo)', () => {
  const vimeoUrl = '/vimeo/video/76979871';

  test('should display Vimeo embed', async ({ page }) => {
    await page.goto(vimeoUrl);
    await expect(page.locator('[data-testid="vimeo-embed"]')).toBeVisible();
  });

  test('should display Comments heading for Vimeo', async ({ page }) => {
    await page.goto(vimeoUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on Vimeo', async ({ page }) => {
    await page.goto(vimeoUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (SoundCloud)', () => {
  const soundcloudUrl = '/soundcloud/track/user%2Ftrack-name';

  test('should display SoundCloud embed', async ({ page }) => {
    await page.goto(soundcloudUrl);
    await expect(page.locator('[data-testid="soundcloud-embed"]')).toBeVisible({ timeout: 20_000 });
  });

  test('should display Comments heading for SoundCloud', async ({ page }) => {
    await page.goto(soundcloudUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on SoundCloud', async ({ page }) => {
    await page.goto(soundcloudUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (Mixcloud)', () => {
  const mixcloudUrl = '/mixcloud/mix/user%2Fmix-name';

  test('should display Mixcloud embed', async ({ page }) => {
    await page.goto(mixcloudUrl);
    await expect(page.locator('[data-testid="mixcloud-embed"]')).toBeVisible();
  });

  test('should display Comments heading for Mixcloud', async ({ page }) => {
    await page.goto(mixcloudUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on Mixcloud', async ({ page }) => {
    await page.goto(mixcloudUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (Spreaker)', () => {
  const spreakerUrl = '/spreaker/episode/12345678';

  test('should display Spreaker embed', async ({ page }) => {
    await page.goto(spreakerUrl);
    await expect(page.locator('[data-testid="spreaker-embed"]')).toBeVisible();
  });

  test('should display Comments heading for Spreaker', async ({ page }) => {
    await page.goto(spreakerUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should display login prompt when not logged in on Spreaker', async ({ page }) => {
    await page.goto(spreakerUrl);
    await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
  });
});

test.describe('Content page (Podcast feed)', () => {
  // Base64url-encoded "https://example.com/feed.xml"
  const feedUrl = '/podcast/feed/aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA';

  test('should render podcast feed page with header', async ({ page }) => {
    await page.goto(feedUrl);
    await expect(page.locator('header a[href="/"]')).toBeVisible();
  });

  test('should display Comments heading for podcast feed', async ({ page }) => {
    await page.goto(feedUrl);
    await expect(page.locator('h2:has-text("Comments")')).toBeVisible();
  });

  test('should show episode selection hint instead of comment form', async ({ page }) => {
    await page.goto(feedUrl);
    await expect(page.locator('[data-testid="feed-comment-hint"]')).toBeVisible();
    await expect(page.locator('[data-testid="comment-form"]')).toHaveCount(0);
  });
});

test.describe('Content page navigation between new platforms', () => {
  test('should navigate from Vimeo to SoundCloud via home', async ({ page }) => {
    await page.goto('/vimeo/video/76979871');
    await expect(page.locator('[data-testid="vimeo-embed"]')).toBeVisible();

    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://soundcloud.com/user/track-name');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/soundcloud\/track\//);
  });

  test('should navigate from Mixcloud to Spreaker via home', async ({ page }) => {
    await page.goto('/mixcloud/mix/user%2Fmix-name');
    await expect(page.locator('[data-testid="mixcloud-embed"]')).toBeVisible();

    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.spreaker.com/episode/12345678');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/spreaker\/episode\//);
  });
});

test.describe('Extension-only providers — install prompt', () => {
  // No login needed, just MockPool for WebSocket interception
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
  });

  // Test each extension-only provider shows "requires extension" prompt
  const extensionProviders = [
    { name: 'Netflix', path: '/netflix/title/12345' },
    { name: 'Prime Video', path: '/primevideo/video/12345' },
    { name: 'Disney+', path: '/disneyplus/video/12345' },
    { name: 'Apple Music', path: '/apple-music/album/12345' },
    { name: 'Fountain.fm', path: '/fountain/episode/12345' },
    { name: 'AbemaTV', path: '/abema/video/12345' },
    { name: 'TVer', path: '/tver/episode/12345' },
    { name: 'U-NEXT', path: '/unext/title/12345' }
  ];

  for (const { name, path } of extensionProviders) {
    test(`should show install extension prompt for ${name}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/requires.*extension|拡張機能が必要/).first()).toBeVisible({
        timeout: 15_000
      });
    });
  }

  test('should show Chrome install link on extension provider page', async ({ page }) => {
    await page.goto('/netflix/title/12345');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Install for Chrome|Chrome版をインストール/).first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should show Firefox install link on extension provider page', async ({ page }) => {
    await page.goto('/netflix/title/12345');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Install for Firefox|Firefox版をインストール/).first()).toBeVisible(
      { timeout: 15_000 }
    );
  });
});
