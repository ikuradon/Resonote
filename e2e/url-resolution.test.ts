/**
 * E2E tests for URL resolution edge cases not covered by navigation.test.ts.
 * Covers: Spotify intl, YouTube shorts/music/embed/playlist/channel,
 * Vimeo player, Niconico embed/sp, audio extensions, dangerous URLs.
 */
import { expect, test } from '@playwright/test';

test.describe('Spotify URL variants', () => {
  test('should resolve intl-ja track URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/intl-ja/track/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should resolve intl-fr_FR episode URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://open.spotify.com/intl-fr_FR/episode/4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
  });

  test('should resolve Spotify episode URI', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('spotify:episode:4C6zDr6e86HYqLxPAhO8jA');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/spotify/episode/4C6zDr6e86HYqLxPAhO8jA');
  });
});

test.describe('YouTube URL variants', () => {
  test('should resolve YouTube shorts URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/shorts/dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should resolve music.youtube.com URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should resolve YouTube embed URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/embed/dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should resolve mobile YouTube URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });

  test('should resolve YouTube playlist URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/youtube\/playlist\//);
  });

  test('should resolve YouTube channel URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/youtube\/channel\//);
  });

  test('should prioritize video over playlist when both params present', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
    );
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');
  });
});

test.describe('Vimeo URL variants', () => {
  test('should resolve Vimeo player embed URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://player.vimeo.com/video/76979871');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/vimeo/video/76979871');
  });

  test('should resolve standard Vimeo URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://vimeo.com/76979871');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/vimeo/video/76979871');
  });
});

test.describe('Niconico URL variants', () => {
  test('should resolve embed.nicovideo.jp URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://embed.nicovideo.jp/watch/sm9');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/sm9');
  });

  test('should resolve sp.nicovideo.jp URL (mobile)', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://sp.nicovideo.jp/watch/sm9');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/sm9');
  });
});

test.describe('Other provider URL variants', () => {
  test('should resolve Podbean embed URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.podbean.com/ew/pb-ar8ve-1920b14');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/podbean\/episode\//);
  });

  test('should resolve Spreaker episode URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.spreaker.com/episode/12345678');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/spreaker\/episode\//);
  });

  test('should resolve Vimeo video URL via input', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://vimeo.com/76979871');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/vimeo/video/76979871');
  });

  test('should resolve Mixcloud show URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.mixcloud.com/user/mix-name/');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/mixcloud\/mix\//);
  });

  test('should resolve SoundCloud track URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://soundcloud.com/user/track-name');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/soundcloud\/track\//);
  });
});

test.describe('Audio extension variants', () => {
  test('should resolve .opus URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.opus');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });

  test('should resolve .flac URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.flac');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });

  test('should resolve .aac URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.aac');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });

  test('should resolve .wav URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.wav');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });

  test('should resolve .ogg URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/audio/track.ogg');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/audio\/track\//);
  });

  test('should resolve feed.atom URL as podcast', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://example.com/feed.atom');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL(/\/podcast\/feed\//);
  });
});

test.describe('Dangerous URL rejection', () => {
  test('should reject javascript: URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('javascript:alert(1)');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
  });

  test('should reject data: URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('data:text/html,<h1>xss</h1>');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page.locator('text=Unsupported URL')).toBeVisible();
  });

  test('should handle very long URL without crashing', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill(`https://open.spotify.com/track/${'a'.repeat(2000)}`);
    await page.locator('[data-testid="track-submit-button"]').click();
    // Spotify provider accepts any ID format (no length validation) — verifies no crash
    await expect(page).toHaveURL(new RegExp('/spotify/track/a+'));
  });
});

test.describe('SoundCloud rejection', () => {
  test('should reject SoundCloud playlist (sets) URL', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://soundcloud.com/user/sets/my-playlist');
    await page.locator('[data-testid="track-submit-button"]').click();
    // Sets are rejected → goes to resolve page
    await expect(page).toHaveURL(/\/resolve\//);
  });
});
