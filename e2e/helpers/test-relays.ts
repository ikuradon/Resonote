/**
 * Test relay URLs using IANA-reserved .test TLD.
 * These never resolve in DNS, so even if MockPool fails to intercept
 * WebSocket connections, events cannot leak to real Nostr relays.
 *
 * Used in:
 * - playwright.config.ts (VITE_DEFAULT_RELAYS build-time injection)
 * - E2E test files (MockPool registration)
 */
export const TEST_RELAYS = [
  'wss://relay1.test',
  'wss://relay2.test',
  'wss://relay3.test',
  'wss://relay4.test'
];
