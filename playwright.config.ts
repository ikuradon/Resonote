import { defineConfig } from '@playwright/test';

// Test-only fixed key for signing NIP-B0 bookmarks in E2E tests.
// This is NOT a real key — it is used only in the local test environment.
const TEST_NOSTR_PRIVKEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

export default defineConfig({
  testDir: 'e2e',
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
    command: `pnpm run build && pnpm run preview:e2e --binding SYSTEM_NOSTR_PRIVKEY=${TEST_NOSTR_PRIVKEY} --binding UNSAFE_ALLOW_PRIVATE_IPS=1`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
