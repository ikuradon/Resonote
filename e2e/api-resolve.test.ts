import { test, expect } from '@playwright/test';
import { startMockServer, type MockServer } from './helpers/mock-server.js';

let mock: MockServer;

test.beforeAll(async () => {
  mock = await startMockServer();
});

test.afterAll(async () => {
  await mock.close();
});

test.describe('API integration: /api/system/pubkey', () => {
  test('should return system public key', async ({ request }) => {
    const res = await request.get('/api/system/pubkey');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('pubkey');
    expect(typeof data.pubkey).toBe('string');
    expect(data.pubkey).toHaveLength(64);
  });
});

test.describe('API integration: /api/podcast/resolve', () => {
  test('should resolve RSS feed URL and return feed data with signed events', async ({
    request
  }) => {
    const feedUrl = `${mock.url}/feed.xml`;
    const res = await request.get(`/api/podcast/resolve?url=${encodeURIComponent(feedUrl)}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();

    expect(data.type).toBe('feed');
    expect(data.feed.title).toBe('Test Podcast');
    expect(data.feed.podcastGuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(data.episodes).toHaveLength(2);
    expect(data.episodes[0].title).toBe('Episode 1: Hello World');
    expect(data.episodes[1].title).toBe('Episode 2: Testing');
    // Feed event + 2 episode events
    expect(data.signedEvents.length).toBe(3);
    // All signed events should have id and sig
    for (const ev of data.signedEvents) {
      expect(ev).toHaveProperty('id');
      expect(ev).toHaveProperty('sig');
      expect(ev.kind).toBe(39701);
    }
  });

  test('should resolve audio URL and return episode metadata', async ({ request }) => {
    const audioUrl = `${mock.url}/audio.mp3`;
    const res = await request.get(`/api/podcast/resolve?url=${encodeURIComponent(audioUrl)}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();

    expect(data.type).toBe('episode');
    // Audio metadata extracted from ID3v2 header
    expect(data.metadata.title).toBe('Test Track Title');
    expect(data.metadata.artist).toBe('Test Artist');
  });

  test('should redirect site URL with RSS link to feed', async ({ request }) => {
    const siteUrl = `${mock.url}/site-with-rss`;
    const res = await request.get(`/api/podcast/resolve?url=${encodeURIComponent(siteUrl)}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();

    expect(data.type).toBe('redirect');
    expect(data.feedUrl).toContain('/feed.xml');
  });

  test('should return 404 for site without RSS', async ({ request }) => {
    const siteUrl = `${mock.url}/site-no-rss`;
    const res = await request.get(`/api/podcast/resolve?url=${encodeURIComponent(siteUrl)}`);
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('rss_not_found');
  });

  test('should return 400 for missing url parameter', async ({ request }) => {
    const res = await request.get('/api/podcast/resolve');
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('missing_url');
  });

  test('should return 400 for invalid url', async ({ request }) => {
    const res = await request.get('/api/podcast/resolve?url=not-a-url');
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_url');
  });
});

test.describe('API integration: UI flow', () => {
  test('should resolve unknown URL → redirect → podcast feed page', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill(`${mock.url}/site-with-rss`);
    await page.locator('[data-testid="track-submit-button"]').click();

    // Should first go to resolve page
    await expect(page).toHaveURL(/\/resolve\//);

    // API discovers RSS link and redirects to podcast feed page
    await expect(page).toHaveURL(/\/podcast\/feed\//, { timeout: 15_000 });

    // Feed page should display the podcast title
    await expect(page.locator('text=Test Podcast')).toBeVisible({ timeout: 10_000 });
  });

  test('should show feed episodes on podcast feed page', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill(`${mock.url}/feed.xml`);
    await page.locator('[data-testid="track-submit-button"]').click();

    await expect(page).toHaveURL(/\/podcast\/feed\//);

    // Feed page should display episodes from the mock feed
    await expect(page.locator('text=Test Podcast')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Episode 1: Hello World')).toBeVisible();
    await expect(page.locator('text=Episode 2: Testing')).toBeVisible();
  });

  test('should show error for site without RSS on resolve page', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill(`${mock.url}/site-no-rss`);
    await page.locator('[data-testid="track-submit-button"]').click();

    await expect(page).toHaveURL(/\/resolve\//);
    // API returns 404 → resolveByApi maps to fetch_failed → "Failed to resolve URL"
    await expect(page.locator('text=Failed to resolve URL')).toBeVisible({
      timeout: 15_000
    });
  });
});
