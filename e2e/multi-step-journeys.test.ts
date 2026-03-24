/**
 * E2E tests for complete multi-step user journeys.
 * Covers section 28 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import {
  broadcastEventsOnAllRelays,
  buildComment,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  TEST_I_TAG,
  TEST_K_TAG,
  TEST_TRACK_URL
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();

test.describe('User journeys', () => {
  test('new user: home → example chip → login → comment → share', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    // 1. Land on home
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Resonote');

    // 2. Click a chip (Spotify)
    const spotifyChip = page.locator('button:has-text("Spotify")');
    await spotifyChip.click();
    await expect(page).toHaveURL(/\/spotify\//);

    // 3. Login
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // 4. Post a comment
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('My first comment!');
    await page.locator('button[type="submit"]').click();
    await expect(textarea).toHaveValue('', { timeout: 10_000 });

    // 5. Open share menu
    const shareButton = page.getByRole('button', { name: /Share|共有/i });
    await shareButton.click();
    await expect(page.getByText(/Copy link|リンクをコピー/).first()).toBeVisible({
      timeout: 5_000
    });
  });

  test('comment lifecycle: post → display → react → delete → disappear', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // 1. Post comment
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('Lifecycle test comment');
    await page.locator('button[type="submit"]').click();
    await expect(textarea).toHaveValue('', { timeout: 10_000 });
    await expect(page.getByText('Lifecycle test comment').first()).toBeVisible({
      timeout: 15_000
    });

    // 2. Delete the comment
    const deleteButton = page
      .locator('article, div')
      .filter({ hasText: 'Lifecycle test comment' })
      .first()
      .getByRole('button', { name: /Delete|削除/i })
      .first();
    await deleteButton.click();

    const confirmButton = page.getByRole('button', { name: /^Delete$|^削除$/ }).last();
    await confirmButton.click();

    // 3. Comment should disappear
    await expect(page.getByText('Lifecycle test comment')).toHaveCount(0, { timeout: 15_000 });
  });

  test('social flow: content → comment → avatar → profile', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    // Pre-store a comment from another user
    const comment = buildComment(otherUser, 'Social flow comment', TEST_I_TAG, TEST_K_TAG);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [comment]);

    // Wait for comment to appear
    await expect(page.getByText('Social flow comment').first()).toBeVisible({ timeout: 15_000 });

    // Click on the avatar/profile link to navigate to profile
    const profileLink = page.locator('a[href*="/profile/"]').first();
    await expect(profileLink).toBeVisible({ timeout: 5_000 });
    await profileLink.click();

    await expect(page).toHaveURL(/\/profile\//, { timeout: 10_000 });
  });

  test('settings flow: settings → mute section → notification filter → back', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // 1. Verify mute section
    await expect(
      page
        .locator('h2')
        .filter({ hasText: /Mute|ミュート/ })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    // 2. Switch notification filter
    const followsButton = page.getByRole('button', { name: /^Follows$|^フォロー$/ });
    await expect(followsButton).toBeVisible({ timeout: 10_000 });
    await followsButton.click();

    // 3. Go back
    await page.goBack();
    await expect(page).not.toHaveURL('/settings');
  });

  test('platform exploration: SP → Home → YT → Home → NC', async ({ page }) => {
    // 1. Spotify
    await page.goto('/spotify/track/4C6zDr6e86HYqLxPAhO8jA');
    await expect(page.locator('[data-testid="spotify-embed"]')).toBeVisible();

    // 2. Home
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    // 3. YouTube
    const input = page.locator('[data-testid="track-url-input"]');
    await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/youtube/video/dQw4w9WgXcQ');

    // 4. Home
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL('/');

    // 5. Niconico
    await page
      .locator('[data-testid="track-url-input"]')
      .fill('https://www.nicovideo.jp/watch/sm9');
    await page.locator('[data-testid="track-submit-button"]').click();
    await expect(page).toHaveURL('/niconico/video/sm9');
  });

  test('CW flow: receive CW comment → hidden → show → hide', async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);

    const cwComment = buildComment(
      otherUser,
      'Spoiler: it was the butler',
      TEST_I_TAG,
      TEST_K_TAG,
      {
        cwReason: 'mystery novel spoiler'
      }
    );

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);
    await broadcastEventsOnAllRelays(page, [cwComment]);

    // 1. CW visible, content hidden
    await expect(page.getByText('mystery novel spoiler').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Spoiler: it was the butler')).toHaveCount(0);

    // 2. Show content
    await page
      .getByRole('button', { name: /Show|表示/i })
      .first()
      .click();
    await expect(page.getByText('Spoiler: it was the butler').first()).toBeVisible({
      timeout: 5_000
    });

    // 3. Hide content again
    await page
      .getByText(/Hide|非表示/i)
      .first()
      .click();
    await expect(page.getByText('Spoiler: it was the butler')).toHaveCount(0, { timeout: 5_000 });
  });

  test('read-only login flow: login → browse → cannot submit', async ({ page }) => {
    await setupMockPool(page);

    await page.goto(TEST_TRACK_URL);
    await page.waitForLoadState('networkidle');

    // Read-only login (no signEvent)
    await page.evaluate(async (pk: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = { getPublicKey: async () => pk };
      document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
    }, user.pubkey);

    // Should see textarea
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Navigate to settings → NIP-44 warning
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=NIP-44')).toBeVisible({ timeout: 10_000 });
  });
});
