# Implementation Plan: Issue #11

Based on spec: `2026-03-16-i18n-touch-targets-design.md`

## Step 1: Add all i18n keys (batch)

Tasks 1, 2, 5 all modify `en.json` and `ja.json`. Batch all key additions into a single step to avoid merge conflicts.

**Actions**:

- `src/lib/i18n/en.json`: Remove `track.placeholder`, add 14 new keys (9 placeholder + 3 resolve + 2 relay banner)
- `src/lib/i18n/ja.json`: Same removals and additions

**New keys**:

```
track.placeholder.youtube, track.placeholder.spotify,
track.placeholder.soundcloud, track.placeholder.podcast,
track.placeholder.vimeo, track.placeholder.mixcloud,
track.placeholder.audio, track.placeholder.niconico,
track.placeholder.podbean,
resolve.loading, resolve.error.not_found, resolve.error.parse_failed,
relay.disconnected.title, relay.disconnected.message
```

**Verify**: `pnpm check` passes (TypeScript compile-time completeness check on ja.json)

## Step 2: Component changes (parallel)

After i18n keys are in place, all component changes touch different files and can be done in parallel.

### Step 2a: TrackInput placeholder i18n

**File**: `src/lib/components/TrackInput.svelte`

- Replace static `placeholders` array (L10-19) with `$derived.by()` that calls `t()` for each key
- Remove the now-unused static array

### Step 2b: ResolveLoader error message i18n

**File**: `src/lib/components/ResolveLoader.svelte`

- Add `import { t } from '../i18n/t.js';`
- Replace 4 hardcoded strings:
  - L28: `→ t('resolve.error.not_found')`
  - L29: `→ t('resolve.error.parse_failed')`
  - L39: `→ t('resolve.error.parse_failed')`
  - L50: `→ t('resolve.loading')`

### Step 2c: CommentList touch targets

**File**: `src/lib/components/CommentList.svelte`

- Add `min-h-11` to action buttons: like (L410), reply (L447), mute (L467), delete (L487)
- Ensure `items-center` is present on each

### Step 2d: Bookmarks + Settings touch targets

**Files**: `src/web/routes/bookmarks/+page.svelte`, `src/web/routes/settings/+page.svelte`

- Change `h-7 w-7` to `min-h-11 min-w-11` on delete buttons (bookmarks L111, settings L416)

### Step 2e: RelayStatus touch target

**File**: `src/lib/components/RelayStatus.svelte`

- Add `min-h-11` to dropdown trigger button (L51-53)

### Step 2f: Relay disconnection banner

**File**: `src/web/routes/+layout.svelte`

- Import `getRelays` from `$lib/stores/relays.svelte.js`
- Add derived state: `connectedCount`, `noRelayConnecting` (check for transitional states)
- Add banner markup between `<header>` and `<main>`, conditionally rendered when `relays.length > 0 && connectedCount === 0 && noRelayConnecting`

## Step 3: Validation

Run the full pre-commit check suite:

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Fix any failures before proceeding.

## Dependency Graph

```
Step 1 (i18n keys)
  ├─→ Step 2a (TrackInput)
  ├─→ Step 2b (ResolveLoader)
  ├─→ Step 2f (relay banner)
  │
  │   (no dependency on Step 1)
  ├─→ Step 2c (CommentList touch)
  ├─→ Step 2d (bookmarks/settings touch)
  └─→ Step 2e (RelayStatus touch)
       │
       └─→ Step 3 (validation) — depends on ALL Step 2 substeps
```

Steps 2c, 2d, 2e have no dependency on Step 1 (CSS-only changes) but are grouped in Step 2 for simplicity.
