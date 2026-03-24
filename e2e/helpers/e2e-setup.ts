/**
 * Shared E2E test setup helpers.
 *
 * Centralizes tsunagiya MockPool injection, window.nostr mock,
 * login simulation, and event injection to avoid duplication across test files.
 */
import type { Page } from '@playwright/test';
import fs from 'fs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import path from 'path';

import { TEST_RELAYS } from './test-relays.js';

// Kind constants mirrored from src/shared/nostr/events.ts.
// Direct import is not possible because events.ts transitively imports helpers.ts
// which uses import.meta.env (unavailable in Playwright's Node.js context).
const COMMENT_KIND = 1111;
const REACTION_KIND = 7;
const DELETION_KIND = 5;
const BOOKMARK_KIND = 10003;
const RELAY_LIST_KIND = 10002;
const METADATA_KIND = 0;

export {
  BOOKMARK_KIND,
  COMMENT_KIND,
  DELETION_KIND,
  METADATA_KIND,
  REACTION_KIND,
  RELAY_LIST_KIND,
  TEST_RELAYS
};

/** Common test content ID for Spotify track used across E2E tests. */
export const TEST_I_TAG = 'spotify:track:4C6zDr6e86HYqLxPAhO8jA';
export const TEST_K_TAG = 'spotify:track';
export const TEST_TRACK_URL = '/spotify/track/4C6zDr6e86HYqLxPAhO8jA';

// Read and patch the tsunagiya bundle ONCE at module load.
// Playwright's addInitScript wraps code in a function scope,
// so `var Tsunagiya = (...)()` does NOT create window.Tsunagiya.
// We replace `var Tsunagiya` with `window.Tsunagiya` to hoist it.
const bundleSrc = fs.readFileSync(path.resolve('e2e/helpers/tsunagiya-bundle.js'), 'utf8');
const patchedBundle = bundleSrc.replace('var Tsunagiya', 'window.Tsunagiya');
if (patchedBundle === bundleSrc) {
  throw new Error(
    'Failed to patch tsunagiya bundle: "var Tsunagiya" not found. ' +
      'The bundle format may have changed — update the replace pattern.'
  );
}

/**
 * Inject tsunagiya MockPool into the browser context.
 * Must be called before page.goto().
 */
export async function setupMockPool(page: Page): Promise<void> {
  await page.addInitScript(patchedBundle);
  await page.addInitScript((relays: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = new (window as any).Tsunagiya.MockPool();
    for (const url of relays) {
      pool.relay(url);
    }
    pool.install();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mockPool = pool;
  }, TEST_RELAYS);
}

/**
 * Set up full login with NIP-07 signer.
 * Locks window.nostr with configurable:false to prevent nostr-login proxy.
 * Must be called before page.goto().
 */
export async function setupFullLogin(
  page: Page,
  pubkey: string,
  signEvent: (event: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }) => ReturnType<typeof import('nostr-tools/pure').finalizeEvent>
): Promise<void> {
  await page.exposeFunction('__nostrSignEvent', signEvent);
  await page.addInitScript((pk: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nostrMock: any = {
      getPublicKey: async () => pk,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signEvent: async (e: any) => (window as any).__nostrSignEvent(e)
    };
    try {
      Object.defineProperty(window, 'nostr', {
        value: nostrMock,
        writable: false,
        configurable: false
      });
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).nostr = nostrMock;
    }
  }, pubkey);
}

/**
 * Fire nlAuth login event. Call after page.goto() + waitForLoadState().
 */
export async function simulateLogin(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('nlAuth', { detail: { type: 'login' } }));
  });
}

// ---------------------------------------------------------------------------
// Test identity helpers
// ---------------------------------------------------------------------------

export interface TestIdentity {
  sk: Uint8Array;
  pubkey: string;
  sign: (event: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }) => ReturnType<typeof finalizeEvent>;
}

/** Create a random test identity with signing capability. */
export function createTestIdentity(): TestIdentity {
  const sk = generateSecretKey();
  return {
    sk,
    pubkey: getPublicKey(sk),
    sign: (event) => finalizeEvent(event, sk)
  };
}

// ---------------------------------------------------------------------------
// Nostr event builders (run in Node.js, pass serialized events to browser)
// ---------------------------------------------------------------------------

const COMMENT_KIND_STR = String(COMMENT_KIND);

/** Build a signed kind:1111 comment event. */
export function buildComment(
  identity: TestIdentity,
  content: string,
  iTagValue: string,
  kTagValue: string,
  opts?: {
    positionSec?: number;
    parentId?: string;
    parentPubkey?: string;
    cwReason?: string;
    createdAt?: number;
  }
): ReturnType<typeof finalizeEvent> {
  const tags: string[][] = [
    ['I', iTagValue],
    ['K', kTagValue]
  ];
  if (opts?.parentId && opts.parentPubkey) {
    tags.push(
      ['e', opts.parentId, '', opts.parentPubkey],
      ['k', COMMENT_KIND_STR],
      ['p', opts.parentPubkey]
    );
  }
  if (opts?.positionSec !== undefined) {
    tags.push(['position', String(opts.positionSec)]);
  }
  if (opts?.cwReason !== undefined) {
    tags.push(['content-warning', opts.cwReason]);
  }
  return identity.sign({
    kind: COMMENT_KIND,
    content,
    tags,
    created_at: opts?.createdAt ?? Math.floor(Date.now() / 1000)
  });
}

/** Build a signed kind:7 reaction event. Includes I-tag for subscription filter match. */
export function buildReaction(
  identity: TestIdentity,
  targetEventId: string,
  targetPubkey: string,
  iTagValue: string,
  reaction = '+'
): ReturnType<typeof finalizeEvent> {
  return identity.sign({
    kind: REACTION_KIND,
    content: reaction,
    tags: [
      ['e', targetEventId],
      ['p', targetPubkey],
      ['k', COMMENT_KIND_STR],
      ['I', iTagValue]
    ],
    created_at: Math.floor(Date.now() / 1000)
  });
}

/** Build a signed kind:5 deletion event. Includes I-tag for subscription filter match. */
export function buildDeletion(
  identity: TestIdentity,
  targetEventIds: string[],
  iTagValue: string
): ReturnType<typeof finalizeEvent> {
  const tags: string[][] = targetEventIds.map((id) => ['e', id]);
  tags.push(['I', iTagValue]);
  return identity.sign({
    kind: DELETION_KIND,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000)
  });
}

/** Build a signed kind:10002 relay list event. */
export function buildRelayList(
  identity: TestIdentity,
  relays: { url: string; read?: boolean; write?: boolean }[]
): ReturnType<typeof finalizeEvent> {
  const tags: string[][] = relays.map((r) => {
    if (r.read && !r.write) return ['r', r.url, 'read'];
    if (r.write && !r.read) return ['r', r.url, 'write'];
    return ['r', r.url];
  });
  return identity.sign({
    kind: RELAY_LIST_KIND,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000)
  });
}

/** Build a signed kind:0 metadata (profile) event. */
export function buildMetadata(
  identity: TestIdentity,
  profile: { name?: string; about?: string; picture?: string; nip05?: string }
): ReturnType<typeof finalizeEvent> {
  return identity.sign({
    kind: METADATA_KIND,
    content: JSON.stringify(profile),
    tags: [],
    created_at: Math.floor(Date.now() / 1000)
  });
}

// ---------------------------------------------------------------------------
// Browser-side event injection & verification
// ---------------------------------------------------------------------------

/**
 * Send events to all mock relays.
 * @param broadcast If true, also broadcasts to active subscriptions (real-time).
 *                  If false, only stores for backward REQ fetch.
 */
async function sendEventsToRelays(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[],
  broadcast: boolean
): Promise<void> {
  await page.evaluate(
    ({ events: evts, relays, doBroadcast }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      for (const url of relays) {
        const relay = pool.relay(url);
        for (const ev of evts) {
          relay.store(ev);
          if (doBroadcast) relay.broadcast(ev);
        }
      }
    },
    { events, relays: TEST_RELAYS, doBroadcast: broadcast }
  );
}

/**
 * Store events on all mock relays for backward (REQ) fetch.
 * Use BEFORE page.goto() to pre-populate data.
 */
export async function storeEventsOnAllRelays(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[]
): Promise<void> {
  await sendEventsToRelays(page, events, false);
}

/**
 * Broadcast events to all mock relays for real-time (forward) subscription.
 * Use AFTER page.goto() to simulate events arriving in real-time.
 * Also stores them so subsequent REQ fetches can find them.
 */
export async function broadcastEventsOnAllRelays(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[]
): Promise<void> {
  await sendEventsToRelays(page, events, true);
}

/**
 * Get EVENT messages published by the app to mock relays.
 * Checks all relays (castSigned may route to any subset).
 * Optionally filter by event kind.
 */
export async function getPublishedEvents(page: Page, kind?: number): Promise<unknown[]> {
  return page.evaluate(
    ({ relayUrls, filterKind }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pool = (window as any).__mockPool;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = [];
      for (const url of relayUrls) {
        const relay = pool.relay(url);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all.push(
          ...relay.received.filter((m: any) => {
            if (m[0] !== 'EVENT') return false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (filterKind !== undefined && (m[1] as any)?.kind !== filterKind) return false;
            return true;
          })
        );
      }
      return all;
    },
    { relayUrls: TEST_RELAYS, filterKind: kind }
  );
}
