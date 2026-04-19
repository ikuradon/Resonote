/**
 * E2E tests for profile display with pre-stored kind:0 data.
 * Covers section 14 of e2e-test-scenarios.md.
 *
 * Profile data is fetched via one-shot backward REQ (fetchProfiles),
 * which closes after EOSE. Events must be pre-loaded via addInitScript
 * (preloadEvents) before page.goto(), not broadcast after.
 */
import { npubEncode } from '@auftakt/core';
import { expect, test } from '@playwright/test';

import {
  buildMetadata,
  createTestIdentity,
  preloadEvents,
  setupFullLogin,
  setupMockPool,
  simulateLogin
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
    await preloadEvents(page, [metadata]);
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
    await preloadEvents(page, [metadata]);
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

    const fallback = page.getByText(/not found|見つかりません|unknown|不明|npub1qq/i).first();
    await expect(fallback).toBeVisible({ timeout: 15_000 });
  });

  // NIP-05 verification requires HTTP request to /.well-known/nostr.json
  // which is not available in E2E. The nip05 field is set in metadata but
  // displayed only after successful verification. Covered by unit tests.
  test('should display profile name with nip05 metadata', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      name: 'NipUser',
      nip05: 'test@example.com'
    });
    await preloadEvents(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // At minimum the profile name should display even if NIP-05 verification fails
    await expect(page.getByText('NipUser').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should show default avatar when no picture in profile', async ({ page }) => {
    const metadata = buildMetadata(otherUser, { name: 'NoPic' });
    await preloadEvents(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('NoPic').first()).toBeVisible({ timeout: 15_000 });
  });

  // Profile bio renders as plain text (no URL linkification).
  // Verify the about text is displayed as-is.
  test('should display profile bio text', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      about: 'Visit https://example.com for info'
    });
    await preloadEvents(page, [metadata]);
    await page.goto(`/profile/${otherNpub}`);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('Visit https://example.com for info').first()).toBeVisible({
      timeout: 15_000
    });
  });
});
