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

    await page.goto(`/profile/${otherNpub}`);
    await storeEventsOnAllRelays(page, [metadata]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('TestUser').first()).toBeVisible({ timeout: 15_000 });
  });

  test('should display profile bio from kind:0 metadata', async ({ page }) => {
    const metadata = buildMetadata(otherUser, {
      name: 'BioUser',
      about: 'This is my bio text for testing'
    });

    await page.goto(`/profile/${otherNpub}`);
    await storeEventsOnAllRelays(page, [metadata]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('This is my bio text for testing').first()).toBeVisible({
      timeout: 15_000
    });
  });
});
