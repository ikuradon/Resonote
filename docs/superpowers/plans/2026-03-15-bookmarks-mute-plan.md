# Bookmarks + Mute List + Notification WoT Filter — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add content bookmarks (kind:10003), NIP-44 encrypted mute list (kind:10000), and notification WoT filter to Resonote.

**Architecture:** Three independent features sharing the same auth lifecycle. Bookmarks use NIP-51 kind:10003 with NIP-73 `i` tags for external content. Mute list uses NIP-51 kind:10000 with NIP-44 encrypted content (lumilumi pattern). Notification filter reuses existing `matchesFilter` from follows store.

**Tech Stack:** SvelteKit, Svelte 5 runes, rx-nostr, NIP-44 via `window.nostr.nip44`, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-bookmarks-mute-design.md`

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Bookmark store

**Files:**

- Create: `src/lib/stores/bookmarks.svelte.ts`

- [ ] **Step 1: Implement bookmark store**

```typescript
import type { ContentId, ContentProvider } from '../content/types.js';
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('bookmarks');

export interface BookmarkEntry {
  type: 'content' | 'event';
  value: string; // "platform:type:id" or eventId
  hint?: string; // openUrl or relay hint
}

let entries = $state<BookmarkEntry[]>([]);
let loading = $state(false);
let generation = 0;

export function getBookmarks() {
  return {
    get entries() {
      return entries;
    },
    get loading() {
      return loading;
    }
  };
}

export function isBookmarked(contentId: ContentId): boolean {
  const value = `${contentId.platform}:${contentId.type}:${contentId.id}`;
  return entries.some((e) => e.type === 'content' && e.value === value);
}

export function clearBookmarks(): void {
  ++generation;
  entries = [];
  loading = false;
}
```

Add `loadBookmarks`, `addBookmark`, `removeBookmark` following the same rx-nostr backward request pattern used in follows.svelte.ts. Key details:

- `loadBookmarks(pubkey)`: fetch kind:10003, parse `i` tags → content entries, `e` tags → event entries
- `addBookmark(contentId, provider)`: fetch latest kind:10003, add `["i", "platform:type:id", provider.openUrl(contentId)]`, republish via `castSigned()`
- `removeBookmark(contentId)`: fetch latest kind:10003, filter out matching `i` tag, republish
- `isBookmarked()`: check local state (synchronous)

- [ ] **Step 2: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/bookmarks.svelte.ts
git commit -m "Add bookmark store (kind:10003 with NIP-73 i-tag extension)"
```

---

## Task 2: Bookmark UI

**Files:**

- Create: `src/web/routes/bookmarks/+page.svelte`
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte` (add ★ button)
- Modify: `src/lib/stores/auth.svelte.ts` (load/clear bookmarks on login/logout)
- Modify: `src/lib/i18n/en.json`
- Modify: `src/lib/i18n/ja.json`

- [ ] **Step 1: Add i18n keys**

en.json:

```json
"bookmark.add": "Bookmark",
"bookmark.remove": "Remove bookmark",
"bookmark.title": "Bookmarks",
"bookmark.empty": "No bookmarks yet",
"bookmark.content": "Content",
"bookmark.comment": "Comment"
```

ja.json:

```json
"bookmark.add": "ブックマーク",
"bookmark.remove": "ブックマーク解除",
"bookmark.title": "ブックマーク",
"bookmark.empty": "ブックマークはまだありません",
"bookmark.content": "コンテンツ",
"bookmark.comment": "コメント"
```

- [ ] **Step 2: Add ★ button to content page**

In `src/web/routes/[platform]/[type]/[id]/+page.svelte`, add a bookmark toggle button next to ShareButton. Only visible when logged in.

```svelte
{#if auth.loggedIn}
  <button
    type="button"
    onclick={() => (bookmarked ? removeBookmark(contentId) : addBookmark(contentId, provider))}
    disabled={bookmarkBusy}
    class="..."
    title={bookmarked ? t('bookmark.remove') : t('bookmark.add')}
  >
    {#if bookmarked}★{:else}☆{/if}
  </button>
{/if}
```

Import `isBookmarked`, `addBookmark`, `removeBookmark` from bookmarks store. Use `$derived` for `bookmarked` state.

- [ ] **Step 3: Load/clear bookmarks in auth lifecycle**

In `src/lib/stores/auth.svelte.ts`:

- `onLogin`: add `loadBookmarks(pubkey)` call (dynamic import, fire-and-forget with `.catch()`)
- `onLogout`: add `clearBookmarks()` call

- [ ] **Step 4: Create /bookmarks page**

`src/web/routes/bookmarks/+page.svelte`:

- Login guard (show message if not logged in)
- List of bookmark entries
- Content entries: show platform icon/label + content ID as link (`/{platform}/{type}/{id}`)
- Event entries: show comment preview text + link to content (via I-tag)
- Delete button per entry
- Empty state message
- Use `iTagToContentPath` from content-link.ts for path generation

- [ ] **Step 5: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 6: Commit**

```bash
git add src/web/routes/bookmarks/ src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte src/lib/stores/auth.svelte.ts src/lib/i18n/en.json src/lib/i18n/ja.json
git commit -m "Add bookmark UI: toggle button on content page, /bookmarks page"
```

---

## Task 3: Mute list store

**Files:**

- Create: `src/lib/stores/mute.svelte.ts`

- [ ] **Step 1: Implement mute store**

Key implementation details:

```typescript
import { createLogger, shortHex } from '../utils/logger.js';

const log = createLogger('mute');

let mutedPubkeys = $state<Set<string>>(new Set());
let mutedWords = $state<string[]>([]);
let loading = $state(false);

export function getMuteList() {
  return {
    get mutedPubkeys() {
      return mutedPubkeys;
    },
    get mutedWords() {
      return mutedWords;
    },
    get loading() {
      return loading;
    }
  };
}

export function isMuted(pubkey: string): boolean {
  return mutedPubkeys.has(pubkey);
}

export function isWordMuted(content: string): boolean {
  if (mutedWords.length === 0) return false;
  const lower = content.toLowerCase();
  return mutedWords.some((w) => lower.includes(w));
}

export function hasNip44Support(): boolean {
  return typeof window !== 'undefined' && !!window.nostr?.nip44;
}
```

**NIP-44 encryption/decryption helpers** (inside the module):

```typescript
async function encryptTags(pubkey: string, tags: string[][]): Promise<string> {
  const plaintext = JSON.stringify(tags);
  return await (window.nostr as any).nip44.encrypt(pubkey, plaintext);
}

async function decryptTags(pubkey: string, ciphertext: string): Promise<string[][]> {
  const plaintext = await (window.nostr as any).nip44.decrypt(pubkey, ciphertext);
  return JSON.parse(plaintext);
}
```

**loadMuteList(pubkey)**:

1. Fetch kind:10000 via backward request
2. If event has content, decrypt with NIP-44
3. Parse `p` tags → mutedPubkeys Set, `word` tags → mutedWords array

**muteUser(pubkey) / unmuteUser(pubkey) / muteWord(word) / unmuteWord(word)**:

1. Build current tag list from state
2. Add/remove entry
3. Encrypt all tags with NIP-44
4. Publish kind:10000 with `tags: []`, `content: encrypted`
5. Update local state immediately

**clearMuteList()**: reset all state.

- [ ] **Step 2: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/mute.svelte.ts
git commit -m "Add mute list store with NIP-44 encryption (kind:10000)"
```

---

## Task 4: Mute list UI + comment filtering

**Files:**

- Modify: `src/lib/components/CommentList.svelte` (mute filter + mute menu)
- Modify: `src/lib/stores/notifications.svelte.ts` (mute check)
- Modify: `src/lib/stores/auth.svelte.ts` (load/clear mute list)
- Modify: `src/web/routes/settings/+page.svelte` (mute management section)
- Modify: `src/lib/i18n/en.json`
- Modify: `src/lib/i18n/ja.json`

- [ ] **Step 1: Add i18n keys**

en.json:

```json
"mute.user": "Mute user",
"mute.unmute": "Unmute",
"mute.title": "Mute List",
"mute.users": "Muted Users",
"mute.words": "Muted Words",
"mute.add_word": "Add word",
"mute.word_placeholder": "Word to mute",
"mute.empty_users": "No muted users",
"mute.empty_words": "No muted words",
"mute.nip44_required": "NIP-44 wallet required for mute",
"notification.filter.title": "Notification Filter",
"notification.filter.description": "Filter notifications by trust level"
```

ja.json equivalents.

- [ ] **Step 2: Apply mute filter in CommentList**

In `src/lib/components/CommentList.svelte`:

- Import `isMuted`, `isWordMuted`, `muteUser`, `hasNip44Support` from mute store
- Extend `filteredComments` derivation to also filter by mute:

```typescript
let filteredComments = $derived(
  comments
    .filter((c) => matchesFilter(c.pubkey, followFilter, auth.pubkey))
    .filter((c) => !isMuted(c.pubkey) && !isWordMuted(c.content))
);
```

- Add "Mute" option to comment card (visible when logged in + NIP-44 supported, for other users' comments):

```svelte
{#if auth.loggedIn && !isOwn && hasNip44Support()}
  <button onclick={() => muteUser(comment.pubkey)} ...>
    {t('mute.user')}
  </button>
{/if}
```

- [ ] **Step 3: Apply mute check in notifications**

In `src/lib/stores/notifications.svelte.ts`, in the `classifyEvent` or event handling:

- Import `isMuted`, `isWordMuted` from mute store
- Skip events from muted pubkeys or with muted words

- [ ] **Step 4: Load/clear mute list in auth lifecycle**

In `src/lib/stores/auth.svelte.ts`:

- `onLogin`: add `loadMuteList(pubkey)` (dynamic import, fire-and-forget)
- `onLogout`: add `clearMuteList()`

- [ ] **Step 5: Add mute management to settings page**

In `src/web/routes/settings/+page.svelte`, add a "Mute List" section below relays:

- Muted users list: display name + npub, unmute button
- Muted words list: word text, remove button
- Add word form: input + add button
- NIP-44 not supported: show warning message, disable controls

- [ ] **Step 6: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/CommentList.svelte src/lib/stores/notifications.svelte.ts src/lib/stores/auth.svelte.ts src/web/routes/settings/+page.svelte src/lib/i18n/en.json src/lib/i18n/ja.json
git commit -m "Add mute list UI: comment filtering, mute menu, settings management"
```

---

## Task 5: Notification WoT filter

**Files:**

- Modify: `src/web/routes/settings/+page.svelte` (notification filter setting)
- Modify: `src/lib/stores/notifications.svelte.ts` (apply filter)
- Modify: `src/lib/i18n/en.json`
- Modify: `src/lib/i18n/ja.json`

- [ ] **Step 1: Add notification filter to settings page**

In settings page, add a "Notification Filter" section below mute list:

```svelte
<div class="...">
  <h3>{t('notification.filter.title')}</h3>
  <p class="text-xs text-text-muted">{t('notification.filter.description')}</p>
  <div class="flex items-center rounded-lg bg-surface-2 p-0.5">
    {#each filterOptions as opt (opt.value)}
      <button
        onclick={() => setNotifFilter(opt.value)}
        class="... {notifFilter === opt.value ? 'active' : ''}"
      >
        {t(opt.labelKey)}
      </button>
    {/each}
  </div>
</div>
```

Filter options: `all` / `follows` / `wot` (reuse `notification.filter.all`, `notification.filter.follows`, `notification.filter.wot` from existing i18n — add `notification.filter.wot` if missing).

Save to `localStorage('resonote-notif-filter')`.

- [ ] **Step 2: Apply filter in notification store**

In `src/lib/stores/notifications.svelte.ts`:

- Import `matchesFilter` from follows store
- Read filter from localStorage
- Export `getNotifFilter()` and `setNotifFilter()`
- In `getNotifications()`, filter `items` by the setting:

```typescript
get items() {
  const filter = getNotifFilter();
  if (filter === 'all') return allItems;
  const auth = getAuth();
  return allItems.filter((n) => matchesFilter(n.pubkey, filter, auth.pubkey));
}
```

- [ ] **Step 3: Add missing i18n keys if needed**

Check if `notification.filter.wot` exists. If not, add:

```json
"notification.filter.wot": "WoT"
```

(ja: "WoT")

- [ ] **Step 4: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/settings/+page.svelte src/lib/stores/notifications.svelte.ts src/lib/i18n/en.json src/lib/i18n/ja.json
git commit -m "Add notification WoT filter setting (all/follows/wot)"
```

---

## Final Validation

### Task 6: Full validation suite

- [ ] **Step 1: Pre-commit checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Production build**

```bash
pnpm build
```

- [ ] **Step 4: Extension builds**

```bash
pnpm build:ext:chrome && pnpm build:ext:firefox
```
