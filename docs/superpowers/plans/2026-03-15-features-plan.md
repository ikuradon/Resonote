# Resonote Feature Pack — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NIP-05 verification, relay management, profile pages, NIP-19 routing (custom `ncontent` TLV), and notification feed to Resonote.

**Architecture:** 3 phases with incremental delivery. Each phase builds on the previous. Phase 1 is foundational (NIP-05 + relays), Phase 2 adds navigation (profiles + NIP-19), Phase 3 adds engagement (notifications).

**Tech Stack:** SvelteKit (Svelte 5 runes), rx-nostr, nostr-tools (nip19), @scure/base (bech32), Tailwind CSS v4, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-15-features-design.md`

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Phase 1: NIP-05 検証 + リレー管理 + /settings

### Task 1: NIP-05 verification module

**Files:**

- Create: `src/lib/nostr/nip05.ts`
- Create: `src/lib/nostr/nip05.test.ts`

- [ ] **Step 1: Write failing tests for verifyNip05**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyNip05, clearNip05Cache } from './nip05.js';

describe('verifyNip05', () => {
  beforeEach(() => {
    clearNip05Cache();
    vi.restoreAllMocks();
  });

  it('should return valid for matching pubkey', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ names: { alice: 'abc123' } }), { status: 200 })
    );
    const result = await verifyNip05('alice@example.com', 'abc123');
    expect(result.valid).toBe(true);
  });

  it('should return false for non-matching pubkey', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ names: { alice: 'other' } }), { status: 200 })
    );
    const result = await verifyNip05('alice@example.com', 'abc123');
    expect(result.valid).toBe(false);
  });

  it('should return null for CORS/network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CORS'));
    const result = await verifyNip05('alice@example.com', 'abc123');
    expect(result.valid).toBeNull();
  });

  it('should return false for invalid nip05 format', async () => {
    const result = await verifyNip05('invalid', 'abc123');
    expect(result.valid).toBe(false);
  });

  it('should cache results', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ names: { alice: 'abc123' } }), { status: 200 })
      );
    await verifyNip05('alice@example.com', 'abc123');
    await verifyNip05('alice@example.com', 'abc123');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/lib/nostr/nip05.test.ts
```

- [ ] **Step 3: Implement nip05.ts**

```typescript
import { createLogger } from '../utils/logger.js';

const log = createLogger('nip05');

export interface Nip05Result {
  valid: boolean | null;
  nip05: string;
  checkedAt: number;
}

const cache = new Map<string, Nip05Result>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const TIMEOUT_MS = 5000;
const MAX_CONCURRENT = 5;

let activeCount = 0;
const queue: (() => void)[] = [];

function processQueue(): void {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    activeCount++;
    const next = queue.shift()!;
    next();
  }
}

export function clearNip05Cache(): void {
  cache.clear();
}

export async function verifyNip05(nip05: string, pubkey: string): Promise<Nip05Result> {
  const parts = nip05.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, nip05, checkedAt: Date.now() };
  }

  const cacheKey = `${nip05}:${pubkey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return cached;
  }

  return new Promise<Nip05Result>((resolve) => {
    const run = async () => {
      try {
        const [local, domain] = parts;
        const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(local)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(url, { signal: controller.signal, redirect: 'error' });
        clearTimeout(timeout);

        const json = await res.json();
        const valid = json?.names?.[local] === pubkey;
        const result: Nip05Result = { valid, nip05, checkedAt: Date.now() };
        cache.set(cacheKey, result);
        resolve(result);
      } catch {
        const result: Nip05Result = { valid: null, nip05, checkedAt: Date.now() };
        cache.set(cacheKey, result);
        resolve(result);
      } finally {
        activeCount--;
        processQueue();
      }
    };

    if (activeCount < MAX_CONCURRENT) {
      activeCount++;
      run();
    } else {
      queue.push(run);
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/lib/nostr/nip05.test.ts
```

- [ ] **Step 5: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/nostr/nip05.ts src/lib/nostr/nip05.test.ts
git commit -m "Add NIP-05 verification module with caching and concurrency control"
```

---

### Task 2: Integrate NIP-05 into profile store and UI

**Files:**

- Modify: `src/lib/stores/profile-utils.ts`
- Modify: `src/lib/stores/profile.svelte.ts`
- Modify: `src/lib/components/CommentList.svelte`
- Modify: `src/lib/i18n/en.json`
- Modify: `src/lib/i18n/ja.json`

- [ ] **Step 1: Extend Profile type in profile-utils.ts**

Add `nip05` and `nip05valid` fields to the `Profile` interface:

```typescript
export interface Profile {
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  nip05valid?: boolean | null;
}
```

Add a helper to format NIP-05 for display:

```typescript
export function formatNip05(nip05: string, truncate = false): string {
  if (!truncate) return nip05;
  return nip05.length > 20 ? nip05.slice(0, 18) + '…' : nip05;
}
```

- [ ] **Step 2: Extract nip05 in profile.svelte.ts parseProfileContent**

In `parseProfileContent()`, add nip05 extraction:

```typescript
nip05: typeof meta.nip05 === 'string' ? meta.nip05 : undefined;
```

After setting a profile in the `next` handler, trigger background NIP-05 verification:

```typescript
if (profile.nip05) {
  verifyNip05(profile.nip05, packet.event.pubkey).then((result) => {
    const existing = profiles.get(packet.event.pubkey);
    if (existing) {
      existing.nip05valid = result.valid;
      profiles = new Map(profiles);
    }
  });
}
```

- [ ] **Step 3: Add NIP-05 badge to CommentList.svelte**

In the `commentCard` snippet, after the display name `<span>`, add:

```svelte
{#if getProfile(comment.pubkey)?.nip05valid === true}
  <span class="text-xs text-accent" title={getProfile(comment.pubkey)?.nip05 ?? ''}>
    ✓ {formatNip05(getProfile(comment.pubkey)?.nip05 ?? '', true)}
  </span>
{/if}
```

Import `formatNip05` from `profile-utils.js`.

- [ ] **Step 4: Add i18n keys for NIP-05** (Phase 1 keys only)

Add only NIP-05 related keys to en.json and ja.json. Settings keys will be added in Task 4, profile keys in Task 9, notification keys in Task 12.

- [ ] **Step 5: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/profile-utils.ts src/lib/stores/profile.svelte.ts src/lib/components/CommentList.svelte src/lib/i18n/en.json src/lib/i18n/ja.json
git commit -m "Integrate NIP-05 verification into profile store and comment display"
```

---

### Task 3: Relay management store functions

**Files:**

- Modify: `src/lib/stores/relays.svelte.ts`
- Create: `src/lib/stores/relays.test.ts`
- Modify: `src/lib/nostr/events.ts` (add kind:10002 builder)

- [ ] **Step 1: Add RelayEntry type and fetchRelayList**

In `relays.svelte.ts`, add:

```typescript
export interface RelayEntry {
  url: string;
  read: boolean;
  write: boolean;
}

export async function fetchRelayList(pubkey: string): Promise<RelayEntry[]> {
  // 1. Try kind:10002
  // 2. Fallback to kind:3 content JSON
  // 3. Fallback to DEFAULT_RELAYS
  // NIP-65: ["r", url] = read+write, ["r", url, "read"] = read-only, ["r", url, "write"] = write-only
  // Note: rx-nostr's setDefaultRelays() treats all relays equally (no read/write distinction).
  // Store read/write markers in kind:10002 for other clients, but use all URLs for rx-nostr.
}

export async function publishRelayList(relays: RelayEntry[]): Promise<void> {
  // Build kind:10002 event with r tags
  // castSigned()
  // Update runtime rxNostr.setDefaultRelays()
}
```

- [ ] **Step 2: Write tests for relay entry parsing**

Test the NIP-65 tag parsing: unmarked = read+write, "read" = read-only, "write" = write-only. Test kind:3 fallback JSON parsing. Test empty/malformed inputs.

- [ ] **Step 3: Implement and verify tests pass**

- [ ] **Step 4: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/relays.svelte.ts src/lib/stores/relays.test.ts src/lib/nostr/events.ts
git commit -m "Add relay list fetch (kind:10002 + kind:3 fallback) and publish functions"
```

---

### Task 4: Settings page with relay management UI

**Files:**

- Create: `src/web/routes/settings/+page.svelte`
- Modify: `src/web/routes/+layout.svelte` (add settings link to header)

- [ ] **Step 1: Create /settings route**

Build the settings page with:

- Page title using `t('settings.title')`
- Relay list table: URL, read toggle, write toggle, connection status indicator, delete button
- Add relay form: URL input (wss:// validation) + add button
- Save button → `publishRelayList()`. Disabled if < 1 relay
- Reset to defaults button
- Warning message when 0 relays

Follow existing styling patterns (rounded-xl, bg-surface-1, border-border, text-text-primary, etc.).

- [ ] **Step 2: Add settings link to layout header**

In `+layout.svelte`, add a gear icon link to `/settings` in the header (visible to all users, placed before login button).

- [ ] **Step 3: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/settings/+page.svelte src/web/routes/+layout.svelte
git commit -m "Add settings page with relay management UI"
```

---

## Phase 2: プロフィールページ + NIP-19 ルーティング

### Task 5: NIP-19 decode module

**Files:**

- Create: `src/lib/nostr/nip19-decode.ts`
- Create: `src/lib/nostr/nip19-decode.test.ts`

- [ ] **Step 1: Write tests**

Test decoding of: npub, nprofile (with relays), nevent (with relays, author, kind), note, invalid strings.

- [ ] **Step 2: Implement using nostr-tools nip19**

```typescript
import { decode } from 'nostr-tools/nip19';

export type DecodedNip19 =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string }
  | null;

export function decodeNip19(str: string): DecodedNip19 {
  try {
    const decoded = decode(str);
    // Map to our type based on decoded.type
  } catch {
    return null;
  }
}
```

Note: The project uses subpath imports (`nostr-tools/nip19`), not the main entry. Verify `decode` is exported from this subpath.

````

Note: nostr-tools is already a dependency but only `nostr-tools/nip19` subpath is used. Verify the decode function is available from that subpath.

- [ ] **Step 3: Run tests, pre-commit validation**
- [ ] **Step 4: Commit**

```bash
git add src/lib/nostr/nip19-decode.ts src/lib/nostr/nip19-decode.test.ts
git commit -m "Add NIP-19 decode module for npub, nprofile, nevent, note"
````

---

### Task 6: Custom ncontent TLV encoding

**Files:**

- Create: `src/lib/nostr/content-link.ts`
- Create: `src/lib/nostr/content-link.test.ts`

- [ ] **Step 1: Write tests**

```typescript
it('should encode and decode content link roundtrip', () => {
  const contentId = { platform: 'spotify', type: 'track', id: 'abc123' };
  const relays = ['wss://relay.example.com'];
  const encoded = encodeContentLink(contentId, relays);
  expect(encoded).toMatch(/^ncontent1/);
  const decoded = decodeContentLink(encoded);
  expect(decoded?.contentId).toEqual(contentId);
  expect(decoded?.relays).toEqual(relays);
});
```

- [ ] **Step 2: Implement TLV encoding/decoding**

Use `@scure/base` for bech32 encoding. Add as direct dependency first:

```bash
pnpm add @scure/base
```

```typescript
import { bech32 } from '@scure/base';
// TLV: type 0 = content ID string ("spotify:track:abc123")
// TLV: type 1 = relay URL (repeatable)
```

Content ID is serialized as `platform:type:id` string. When decoding, split on the **first two colons** (not all) to handle IDs that may contain colons:

```typescript
const firstColon = str.indexOf(':');
const secondColon = str.indexOf(':', firstColon + 1);
const platform = str.slice(0, firstColon);
const type = str.slice(firstColon + 1, secondColon);
const id = str.slice(secondColon + 1);
```

- [ ] **Step 3: Run tests, pre-commit validation**
- [ ] **Step 4: Commit**

```bash
git add src/lib/nostr/content-link.ts src/lib/nostr/content-link.test.ts
git commit -m "Add custom ncontent TLV encoding for shareable content links"
```

---

### Task 7: Follow/Unfollow functions

**Files:**

- Modify: `src/lib/stores/follows.svelte.ts`

- [ ] **Step 1: Add followUser and unfollowUser**

```typescript
export async function followUser(targetPubkey: string): Promise<void> {
  // 1. Get auth pubkey
  // 2. Fetch latest kind:3 from relay (or create new if none)
  // 3. Add ["p", targetPubkey] to tags (if not already present)
  // 4. Preserve content field (legacy relay JSON)
  // 5. castSigned() to publish
  // 6. Update local state.follows Set
}

export async function unfollowUser(targetPubkey: string): Promise<void> {
  // Same as above but remove the p-tag
}
```

Key points:

- Preserve `content` field as-is (NIP-02 says unused, but legacy clients stored relay JSON there)
- Preserve ALL elements of existing p-tags (relay_url, petname fields per NIP-02: `["p", pubkey, relay_url, petname]`)
- New follow adds `["p", targetPubkey]` only (no relay_url/petname)
- Disable UI during operation, fetch latest kind:3 before modification

- [ ] **Step 2: Run pre-commit validation**
- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/follows.svelte.ts
git commit -m "Add followUser/unfollowUser with kind:3 content preservation"
```

---

### Task 8: NIP-19 routing page

**Files:**

- Create: `src/web/routes/[nip19]/+page.svelte`

- [ ] **Step 1: Create the route component**

Logic:

1. Read `page.params.nip19` parameter
2. Validate prefix (`npub1`, `nprofile1`, `nevent1`, `note1`, `ncontent1`)
3. Decode using `decodeNip19()` or `decodeContentLink()`
4. Route based on type:
   - npub/nprofile → `goto('/profile/' + param)`
   - nevent/note → fetch event from relay hints → extract `I` tag → `goto('/' + platform + '/' + type + '/' + id)`. If not kind:1111, show message + content link if `I` tag present
   - ncontent → decode content ID → `goto('/' + platform + '/' + type + '/' + id)` with relay hints merged
5. Invalid → show error (404-like)

For relay hint merging: temporarily add relays to rxNostr for the content page subscription.

- [ ] **Step 2: Run pre-commit validation + E2E**
- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[nip19\]/+page.svelte
git commit -m "Add NIP-19 routing for npub, nprofile, nevent, ncontent URLs"
```

---

### Task 9: Profile page

**Files:**

- Create: `src/web/routes/profile/[id]/+page.svelte`
- Modify: `src/lib/stores/profile.svelte.ts` (add `fetchFullProfile`)
- Modify: `src/lib/components/CommentList.svelte` (author name → profile link)

- [ ] **Step 1: Add fetchFullProfile to profile store**

```typescript
export async function fetchFullProfile(pubkey: string, relayHints?: string[]): Promise<void> {
  // Fetch kind:0 (profile), kind:3 (follows), kind:1111 (comments)
  // If relayHints provided, temporarily add them for this fetch
}
```

- [ ] **Step 2: Create profile page component**

Sections:

1. Header: avatar, displayName, NIP-05 badge, bio
2. Stats: follow count (from kind:3 p-tags), follower count (approx, `limit: 500` query)
3. Follow/Unfollow button (logged in only, disabled during operation)
4. Recent comments list (kind:1111, limit:50, paginated with "load more")
5. Commented content list (grouped by `I` tag content)

Handle nprofile relay hints: decode `id` param, if nprofile use relay hints for fetching.

- [ ] **Step 3: Make author names clickable in CommentList**

Wrap display name in `<a href="/profile/{npubEncode(comment.pubkey)}">`.

- [ ] **Step 4: Add ncontent link to ShareButton**

Add "Copy Resonote link" option that calls `encodeContentLink(contentId, DEFAULT_RELAYS)` and copies `https://resonote.pages.dev/{encoded}` to clipboard.

- [ ] **Step 5: Run pre-commit validation + E2E**
- [ ] **Step 6: Commit**

```bash
git add src/web/routes/profile/ src/lib/stores/profile.svelte.ts src/lib/components/CommentList.svelte src/lib/components/ShareButton.svelte
git commit -m "Add profile page with follow/unfollow, comments history, and ncontent sharing"
```

---

## Phase 3: 通知フィード

### Task 10: Notification store

**Files:**

- Create: `src/lib/stores/notifications.svelte.ts`

- [ ] **Step 1: Implement notification store**

```typescript
export type NotificationType = 'reply' | 'reaction' | 'mention' | 'follow_comment';

export interface Notification {
  id: string;
  type: NotificationType;
  event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] };
  createdAt: number;
}
```

Key logic:

- `subscribe(myPubkey, follows)`: start backward + forward dual-request
  - `{ kinds: [1111, 7], "#p": [myPubkey], since: lastReadTimestamp }`
  - `{ kinds: [1111], authors: [...follows], since: loginTimestamp }` (batched 100)
- Classify incoming events:
  - kind:7 + `["p", myPubkey]` → reaction
  - kind:1111 + has `["e", ...]` + has `["p", myPubkey]` → reply (likely reply to my comment)
  - kind:1111 + `["p", myPubkey]` + no `["e", ...]` → mention (top-level comment that mentions me)
  - kind:1111 + authored by follow (not me) → follow_comment (cap 50)

  **NIP-22 互換性の注記**: NIP-22 の返信 e-tag は `["e", id, relayHint]`（3要素）で、4番目に pubkey を含まない場合がある。`["e"] + ["p", myPubkey]` で判定する方が他クライアントの返信も検出できる。mention-in-reply が reply に分類される false positive はあるが、通知としてはいずれも有用なため許容。

- Exclude own events
- `unreadCount`: count items with `createdAt > lastReadTimestamp`
- `markAllAsRead()`: save current timestamp to `localStorage('resonote-notif-last-read')`
- `destroy()`: unsubscribe all, clear state

- [ ] **Step 2: Run pre-commit validation**
- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/notifications.svelte.ts
git commit -m "Add notification store with reply/reaction/mention/follow detection"
```

---

### Task 11: Notification bell component

**Files:**

- Create: `src/lib/components/NotificationBell.svelte`
- Modify: `src/web/routes/+layout.svelte`

- [ ] **Step 1: Create NotificationBell component**

- Bell icon (SVG) with red badge showing `unreadCount`
- Click → dropdown popover (similar pattern to RelayStatus.svelte)
- Dropdown shows latest 5 notifications:
  - Type icon (💬/❤️/@/🎵)
  - Author name + NIP-05 badge
  - Content preview (50 chars)
  - Relative time
  - Click → navigate to content page (extract from `I` tag)
- "View all" link → `/notifications`
- Opening dropdown triggers `markAllAsRead()`
- Outside click closes dropdown

- [ ] **Step 2: Add to layout header**

In `+layout.svelte`, add `<NotificationBell />` in header, visible only when `auth.loggedIn`.

- [ ] **Step 3: Run pre-commit validation + E2E**
- [ ] **Step 4: Commit**

```bash
git add src/lib/components/NotificationBell.svelte src/web/routes/+layout.svelte
git commit -m "Add notification bell with dropdown in header"
```

---

### Task 12: Notifications page

**Files:**

- Create: `src/web/routes/notifications/+page.svelte`

- [ ] **Step 1: Create notifications page**

- Full notification list with pagination (30 per page)
- Type filter tabs: All / Replies / Reactions / Mentions / Follows
- Each notification card:
  - Type icon + author + NIP-05 badge
  - Content preview
  - Content link (from `I` tag)
  - Relative time
  - Visual distinction for unread (e.g., left accent border or background)
- "Mark all as read" button
- Empty state: `t('notification.empty')`
- Login required guard

- [ ] **Step 2: Run pre-commit validation + E2E**
- [ ] **Step 3: Commit**

```bash
git add src/web/routes/notifications/+page.svelte
git commit -m "Add notifications page with filtering and pagination"
```

---

## Final Validation

### Task 13: Full validation suite

- [ ] **Step 1: Pre-commit checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Extension builds**

```bash
pnpm build:ext:chrome && pnpm build:ext:firefox
```

- [ ] **Step 4: Production build**

```bash
pnpm build
```

All must pass.
