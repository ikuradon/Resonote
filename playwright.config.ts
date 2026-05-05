import { defineConfig } from '@playwright/test';

import { TEST_RELAYS } from './e2e/helpers/test-relays.js';

// Test-only fixed key for signing NIP-B0 bookmarks in E2E tests.
// This is NOT a real key — it is used only in the local test environment.
// Override via TEST_NOSTR_PRIVKEY env var if needed.
const DEFAULT_TEST_PRIVKEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const envKey = process.env.TEST_NOSTR_PRIVKEY;
if (envKey && !/^[0-9a-f]{64}$/i.test(envKey)) {
  throw new Error('TEST_NOSTR_PRIVKEY must be a 64-character hex string');
}
const TEST_NOSTR_PRIVKEY = envKey ?? DEFAULT_TEST_PRIVKEY;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: process.env.CI ? 4 : 1,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: {
    command: `VITE_DEFAULT_RELAYS='${JSON.stringify(TEST_RELAYS)}' pnpm run build:e2e && pnpm run preview:e2e --binding SYSTEM_NOSTR_PRIVKEY=${TEST_NOSTR_PRIVKEY} --binding UNSAFE_ALLOW_PRIVATE_IPS=1`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
