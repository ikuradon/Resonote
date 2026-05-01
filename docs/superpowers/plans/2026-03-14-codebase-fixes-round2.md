# Codebase Fixes Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix remaining source bugs, unhandled promise rejections, version inconsistency, and dead config found in second audit.

**Architecture:** Targeted fixes to existing files only. No new files or abstractions. Each task is independent.

**Tech Stack:** SvelteKit, Svelte 5 runes, Chrome Extension MV3, Vitest, pnpm

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Guard tag value access in comments.svelte.ts

`posTag[1]`, `eTag[1]` could be `undefined` if a malformed Nostr event has tags like `['position']` or `['e']` with no value. `parsePosition(undefined)` would throw `TypeError: Cannot read properties of undefined (reading 'match')`.

**Files:**

- Modify: `src/lib/stores/comments.svelte.ts:158,160,178`

- [ ] **Step 1: Fix buildCommentFromEvent (line 158, 160)**

Replace:

```typescript
      positionMs: posTag ? parsePosition(posTag[1]) : null,
      emojiTags,
      replyTo: eTag ? eTag[1] : null,
```

with:

```typescript
      positionMs: posTag?.[1] ? parsePosition(posTag[1]) : null,
      emojiTags,
      replyTo: eTag?.[1] ?? null,
```

- [ ] **Step 2: Fix buildReactionFromEvent (line 171-178)**

Replace:

```typescript
const eTag = event.tags.find((t: string[]) => t[0] === 'e');
if (!eTag) return null;
```

with:

```typescript
const eTag = event.tags.find((t: string[]) => t[0] === 'e' && t[1]);
if (!eTag) return null;
```

This ensures `eTag[1]` is always defined when `eTag` is truthy.

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/comments.svelte.ts
git commit -m "Guard tag value access against malformed Nostr events in comments store"
```

---

## Task 2: Add .catch() to unhandled promises

### 2a: SpotifyEmbed initController

`initController().then()` at line 86 has no `.catch()`. If the Spotify IFrame API fails to load, the promise rejection is unhandled.

**File:** `src/lib/components/SpotifyEmbed.svelte:86-93`

Replace:

```typescript
initController(containerEl, uri).then((ctrl) => {
  if (cancelled) {
    ctrl.destroy();
    return;
  }
  controller = ctrl;
  ready = true;
});
```

with:

```typescript
initController(containerEl, uri)
  .then((ctrl) => {
    if (cancelled) {
      ctrl.destroy();
      return;
    }
    controller = ctrl;
    ready = true;
  })
  .catch((err) => log.error('Failed to initialize Spotify controller', err));
```

### 2b: profile.svelte.ts eventsDB.put

Line 87 `eventsDB.put(packet.event)` is fire-and-forget without `.catch()`, inconsistent with other places in the codebase.

**File:** `src/lib/stores/profile.svelte.ts:87`

Replace:

```typescript
eventsDB.put(packet.event);
```

with:

```typescript
eventsDB.put(packet.event).catch(() => {});
```

### 2c: chrome.runtime.sendMessage in extension content script

Lines 46, 77-81, 110 call `chrome.runtime.sendMessage()` without handling the returned Promise. If the service worker is unavailable, this causes unhandled rejections.

**File:** `src/extension/content-scripts/index.ts:46,77-81,110`

At line 46, replace:

```typescript
chrome.runtime.sendMessage(msg);
```

with:

```typescript
chrome.runtime.sendMessage(msg).catch(() => {});
```

At lines 77-81, replace:

```typescript
chrome.runtime.sendMessage({
  type: 'resonote:site-detected',
  contentId,
  siteUrl: location.href
} satisfies SiteDetectedMessage);
```

with:

```typescript
chrome.runtime
  .sendMessage({
    type: 'resonote:site-detected',
    contentId,
    siteUrl: location.href
  } satisfies SiteDetectedMessage)
  .catch(() => {});
```

At line 110, replace:

```typescript
chrome.runtime.sendMessage({ type: 'resonote:site-lost' } satisfies SiteLostMessage);
```

with:

```typescript
chrome.runtime
  .sendMessage({ type: 'resonote:site-lost' } satisfies SiteLostMessage)
  .catch(() => {});
```

- [ ] **Step 1: Apply all 2a/2b/2c changes**
- [ ] **Step 2: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/SpotifyEmbed.svelte src/lib/stores/profile.svelte.ts src/extension/content-scripts/index.ts
git commit -m "Add .catch() to unhandled promises in Spotify embed, profile store, and extension"
```

---

## Task 3: Align version numbers and remove dead config

### 3a: Sync package.json version to match manifests

**File:** `package.json:4`

Replace:

```json
  "version": "0.0.1",
```

with:

```json
  "version": "0.1.0",
```

### 3b: Remove unused @lib alias from extension vite config

The `@lib` alias in `vite.config.extension.ts` is defined but never imported anywhere in `src/extension/`. All extension files use relative paths (`../../lib/...`).

**File:** `vite.config.extension.ts:7-12`

Replace:

```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@lib': resolve(__dirname, 'src/lib')
    }
  },
  build: {
```

with:

```typescript
export default defineConfig({
  build: {
```

Also remove unused imports if `resolve` and `dirname`/`fileURLToPath` are no longer needed. Check: `resolve` is still used in `rollupOptions.input`, so keep the imports.

- [ ] **Step 1: Apply both changes**
- [ ] **Step 2: Build extensions to verify**

```bash
pnpm build:ext:chrome && pnpm build:ext:firefox
```

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add package.json vite.config.extension.ts
git commit -m "Align version to 0.1.0, remove unused @lib alias from extension config"
```

---

## Final Validation

- [ ] **Step 1: Pre-commit checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Extension build**

```bash
pnpm build:ext:chrome && pnpm build:ext:firefox
```
