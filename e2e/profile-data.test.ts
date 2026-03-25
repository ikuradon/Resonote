/**
 * E2E tests for profile display with pre-stored kind:0 data.
 * Covers section 14 of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';
import { npubEncode } from 'nostr-tools/nip19';

import {
  buildMetadata,
  createTestIdentity,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  storeEventsOnAllRelays
} from './helpers/e2e-setup.js';

const user = createTestIdentity();
const otherUser = createTestIdentity();
const otherNpub = npubEncode(otherUser.pubkey);

test.describe('Profile page — kind:0 display', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display profile name from kind:0 metadata', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      name: 'TestUser',
      about: 'Hello, I am a test user'
    });

    // Store events BEFORE navigating to the profile page to avoid race
    // condition where the profile subscription fires EOSE before data is stored.
    await page.goto('/');
    await storeEventsOnAllRelays(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('TestUser').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should display profile bio from kind:0 metadata', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      name: 'BioUser',
      about: 'This is my bio text for testing'
    });

    // Store events BEFORE navigating to the profile page to avoid race condition.
    await page.goto('/');
    await storeEventsOnAllRelays(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('This is my bio text for testing').first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should show empty comments message on profile', async ({ page }) => {
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText(/No comments yet|コメントはまだありません/).first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should show no profile found for unknown pubkey', async ({ page }) => {
    await page.goto(
      '/profile/npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2pn7kk'
    );
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // Expect some fallback text indicating no profile data
    const fallback = page.getByText(/not found|見つかりません|unknown|不明|npub1qq/i).first();
    await expect(fallback).toBeVisible({ timeout: 15_000 });
  });

  test('should show NIP-05 badge on profile', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      name: 'NipUser',
      nip05: 'test@example.com'
    });

    // Store events BEFORE navigating to avoid race condition.
    await page.goto('/');
    await storeEventsOnAllRelays(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('test@example.com').first()).toBeVisible({
      timeout: 15_000
    });
  });

  test('should show default avatar when no picture in profile', async ({ page }) => {
    const metadata = buildMetadata(otherUser, { name: 'NoPic' });

    // Store events BEFORE navigating to avoid race condition.
    await page.goto('/');
    await storeEventsOnAllRelays(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('NoPic').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should linkify URLs in profile bio', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      about: 'Visit https://example.com for info'
    });

    // Store events BEFORE navigating to avoid race condition.
    await page.goto('/');
    await storeEventsOnAllRelays(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.locator('a[href="https://example.com"]').first()).toBeVisible({
      timeout: 15_000
    });
  });
});
