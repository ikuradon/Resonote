/**
 * E2E tests for bookmarks page with pre-stored kind:10003 data.
 * Covers section 8 bookmark list display scenarios.
 */
import { expect, test } from '@playwright/test';
import { finalizeEvent } from 'nostr-tools/pure';

import {
  BOOKMARK_KIND,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  storeEventsOnAllRelays
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

function buildBookmarkEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  identity: any,
  bookmarks: { type: 'i' | 'e'; value: string; hint?: string }[]
) {
  const tags = bookmarks.map((b) => (b.hint ? [b.type, b.value, b.hint] : [b.type, b.value]));
  return finalizeEvent(
    {
      kind: BOOKMARK_KIND,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000)
    },
    identity.sk
  );
}

test.describe('Bookmarks page — with data', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display content bookmark entries', async ({ page }) => {
    const bookmarkEvent = buildBookmarkEvent(user, [
      { type: 'i', value: 'spotify:track:abc123', hint: 'Great track' },
      { type: 'i', value: 'youtube:video:xyz789', hint: 'Nice video' }
    ]);

    await page.goto('/bookmarks');
    await storeEventsOnAllRelays(page, [bookmarkEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Bookmark entries should appear
    await expect(page.getByText('spotify:track:abc123').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('youtube:video:xyz789').first()).toBeVisible();
  });

  test('should display bookmark hint text', async ({ page }) => {
    const bookmarkEvent = buildBookmarkEvent(user, [
      { type: 'i', value: 'spotify:track:abc123', hint: 'A wonderful song' }
    ]);

    await page.goto('/bookmarks');
    await storeEventsOnAllRelays(page, [bookmarkEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('spotify:track:abc123').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('A wonderful song').first()).toBeVisible();
  });

  test('should display "Content" type badge for i-tag bookmarks', async ({ page }) => {
    const bookmarkEvent = buildBookmarkEvent(user, [{ type: 'i', value: 'spotify:track:abc123' }]);

    await page.goto('/bookmarks');
    await storeEventsOnAllRelays(page, [bookmarkEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('spotify:track:abc123').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Content$|^コンテンツ$/).first()).toBeVisible();
  });
});
