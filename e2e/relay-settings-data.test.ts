/**
 * E2E tests for relay settings with pre-stored kind:10002 data.
 * Covers section 12A-12E of e2e-test-scenarios.md.
 */
import { expect, test } from '@playwright/test';

import {
  buildRelayList,
  createTestIdentity,
  getPublishedEvents,
  RELAY_LIST_KIND,
  setupFullLogin,
  setupMockPool,
  simulateLogin,
  storeEventsOnAllRelays
} from './helpers/e2e-setup.js';

const user = createTestIdentity();

test.describe('Relay settings — kind:10002 display', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, user.pubkey, user.sign);
  });

  test('should display relay URLs from kind:10002 event', async ({ page }) => {
    const relayListEvent = buildRelayList(user, [
      { url: 'wss://relay1.test' },
      { url: 'wss://relay2.test', read: true, write: false },
      { url: 'wss://relay3.test', read: false, write: true }
    ]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('relay2.test').first()).toBeVisible();
    await expect(page.getByText('relay3.test').first()).toBeVisible();
  });

  test('should display Read/Write buttons for each relay', async ({ page }) => {
    const relayListEvent = buildRelayList(user, [
      { url: 'wss://relay1.test' },
      { url: 'wss://relay2.test' }
    ]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('button', { name: 'Read' }).first()).toBeVisible({
      timeout: 5_000
    });
    await expect(page.getByRole('button', { name: 'Write' }).first()).toBeVisible();
  });

  test('should add relay via input field', async ({ page }) => {
    const relayListEvent = buildRelayList(user, [{ url: 'wss://relay1.test' }]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    const input = page.locator('input[aria-label="Relay URL"]');
    await input.fill('wss://new-relay.test');
    await page.getByRole('button', { name: /Add relay|追加/ }).click();

    await expect(page.getByText('new-relay.test').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should reject invalid relay URL', async ({ page }) => {
    const relayListEvent = buildRelayList(user, [{ url: 'wss://relay1.test' }]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    const input = page.locator('input[aria-label="Relay URL"]');
    await input.fill('http://not-websocket.com');
    await page.getByRole('button', { name: /Add relay|追加/ }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5_000 });
  });

  test('should remove relay from list', async ({ page }) => {
    const relayListEvent = buildRelayList(user, [
      { url: 'wss://relay1.test' },
      { url: 'wss://relay2.test' }
    ]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('relay2.test').first()).toBeVisible();

    // relay2 is the second entry → click second remove button
    const removeButtons = page.locator('button[aria-label="Remove relay"]');
    await removeButtons.nth(1).click();

    await expect(page.getByText('relay2.test')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByText('relay1.test').first()).toBeVisible();
  });

  test('should publish kind:10002 on save', async ({ page }) => {
    const relayListEvent = buildRelayList(user, [{ url: 'wss://relay1.test' }]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    const input = page.locator('input[aria-label="Relay URL"]');
    await input.fill('wss://added.test');
    await page.getByRole('button', { name: /Add relay|追加/ }).click();
    await expect(page.getByText('added.test').first()).toBeVisible({ timeout: 5_000 });

    const saveBtn = page.getByRole('button', { name: /^Save$|^保存$/ });
    await saveBtn.click();

    await expect
      .poll(async () => (await getPublishedEvents(page, RELAY_LIST_KIND)).length, {
        timeout: 10_000
      })
      .toBeGreaterThanOrEqual(1);
  });

  test('should show "Not found" or relay list after settled', async ({ page }) => {
    // No relay list pre-stored — useCachedLatest will settle with no event
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    // After settled, should show either "Not found" or a relay list
    const notFound = page.getByText(/No relay list found|リレーリストが見つかりません/i).first();
    const relayEntry = page.getByText(/relay.*\.test/i).first();
    await expect(notFound.or(relayEntry)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Relay settings — validation', () => {
  const validationUser = createTestIdentity();

  test.beforeEach(async ({ page }) => {
    await setupMockPool(page);
    await setupFullLogin(page, validationUser.pubkey, validationUser.sign);
  });

  test('should reject empty relay URL', async ({ page }) => {
    const relayListEvent = buildRelayList(validationUser, [{ url: 'wss://relay1.test' }]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    const relayCountBefore = await page.locator('[aria-label="Remove relay"]').count();

    const input = page.locator('input[aria-label="Relay URL"]');
    await input.fill('');
    await page.getByRole('button', { name: /Add relay|追加/ }).click();

    const relayCountAfter = await page.locator('[aria-label="Remove relay"]').count();
    expect(relayCountAfter).toBe(relayCountBefore);
  });

  test('should clear input after adding relay', async ({ page }) => {
    const relayListEvent = buildRelayList(validationUser, [{ url: 'wss://relay1.test' }]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    const input = page.locator('input[aria-label="Relay URL"]');
    await input.fill('wss://clear-test.test');
    await input.press('Enter');

    await expect(page.getByText('clear-test.test').first()).toBeVisible({ timeout: 5_000 });
    await expect(input).toHaveValue('', { timeout: 5_000 });
  });

  test('should enable save button after modification', async ({ page }) => {
    const relayListEvent = buildRelayList(validationUser, [
      { url: 'wss://relay1.test' },
      { url: 'wss://relay2.test' }
    ]);

    await page.goto('/settings');
    await storeEventsOnAllRelays(page, [relayListEvent]);
    await page.waitForLoadState('networkidle');
    await simulateLogin(page);

    await expect(page.getByText('relay1.test').first()).toBeVisible({ timeout: 15_000 });

    // Toggle a Read/Write button to modify the relay config
    await page.getByRole('button', { name: 'Read' }).first().click();

    const saveBtn = page.getByRole('button', { name: /^Save$|^保存$/ });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  });
});
