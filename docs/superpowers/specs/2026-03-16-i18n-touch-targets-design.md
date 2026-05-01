# Issue #11: Improve i18n Coverage and Mobile Touch Targets

## Scope

Tasks 1-5 from issue #11. Tasks 6 (tablet breakpoints) split to #30; mobile overflow split to #31.

## Task 1: TrackInput Placeholder i18n

**Problem**: `TrackInput.svelte:10-19` has 9 hardcoded Japanese placeholder strings for URL input rotation.

**Solution**:

- Add 9 keys to `en.json` and `ja.json`: `track.placeholder.youtube`, `track.placeholder.spotify`, `track.placeholder.soundcloud`, `track.placeholder.podcast`, `track.placeholder.vimeo`, `track.placeholder.mixcloud`, `track.placeholder.audio`, `track.placeholder.niconico`, `track.placeholder.podbean`
- Remove the unused legacy `track.placeholder` key from both JSON files (confirmed unused in code)
- Change `placeholders` from a static array to `$derived.by()` using `t()` calls, so locale changes take effect immediately

**Files**: `src/lib/i18n/en.json`, `src/lib/i18n/ja.json`, `src/lib/components/TrackInput.svelte`

## Task 2: ResolveLoader Error Message i18n

**Problem**: `ResolveLoader.svelte` has 3 unique hardcoded Japanese strings across 4 code locations. `t()` is not imported.

Locations:

- L28: `'このURLからポッドキャストが見つかりませんでした'`
- L29: `'URLの解析に失敗しました'`
- L39: `'URLの解析に失敗しました'` (duplicate of L29)
- L50: `'URLを解析中...'`

**Solution**:

- Add 3 keys to `en.json` and `ja.json`: `resolve.loading`, `resolve.error.not_found`, `resolve.error.parse_failed`
- Import `t` from `$lib/i18n/t.js` and replace all 4 hardcoded strings

**Files**: `src/lib/i18n/en.json`, `src/lib/i18n/ja.json`, `src/lib/components/ResolveLoader.svelte`

## Task 3: CommentList Action Buttons 44px Touch Targets

**Problem**: Action buttons (like, emoji picker, reply, mute, delete) in `CommentList.svelte:404-516` use `p-1.5` padding only, yielding ~28x28px touch targets. Apple HIG recommends 44x44px minimum. Same issue in `bookmarks/+page.svelte:111` (`h-7 w-7` = 28px) and `settings/+page.svelte:416` (`h-7 w-7`).

**Solution**:

- Add `min-h-11` (44px height) to each action button in `CommentList.svelte`. Do NOT add `min-w-11` — buttons are laid out horizontally with `gap-1`, and adding 44px min-width to 5 buttons would overflow on mobile. Height-only expansion is sufficient for touch targets since fingers are wider than tall.
- Update `bookmarks/+page.svelte` and `settings/+page.svelte` delete buttons: change `h-7 w-7` to `min-h-11 min-w-11` (these are isolated buttons, not in a tight row)
- `items-center justify-center` already present on bookmarks/settings buttons; add to CommentList buttons as needed

**Files**: `src/lib/components/CommentList.svelte`, `src/web/routes/bookmarks/+page.svelte`, `src/web/routes/settings/+page.svelte`

## Task 4: RelayStatus Dropdown Trigger Padding

**Problem**: `RelayStatus.svelte:51-53` — the dropdown trigger button (shows connection dot + count) uses `px-2 py-1`, resulting in ~24px height. Too small for mobile touch.

**Solution**:

- Add `min-h-11` to the button to ensure 44px touch target

**Files**: `src/lib/components/RelayStatus.svelte`

## Task 5: Relay Disconnection Banner

**Problem**: When `connectedCount === 0`, only the relay dot turns red (`RelayStatus.svelte:63-64`). Users may not notice, and comments/reactions silently fail.

**Solution**:

- Add a warning banner in `+layout.svelte` between `<header>` and `<main>`
- Show condition: `relays.length > 0 && connectedCount === 0 && noRelayConnecting` — where `noRelayConnecting` means no relay is in a transitional state (`initialized`, `connecting`, `retrying`, `waiting-for-retrying`). This avoids both: (a) flash before `initRelayStatus` populates `relays` (length check), and (b) false warning while relays are still attempting to connect (transitional state check). The banner only appears when all relays have settled into failed/terminal states (`error`, `rejected`, `terminated`, `dormant`)
- `initRelayStatus()` is already called in `RelayStatus.svelte`'s `onMount` (with a guard `if (subscription) return;`), so the layout only needs to read `getRelays()` — no duplicate init needed
- Banner: amber/warning colored bar with icon + message, not dismissible (resolves automatically when a relay connects)
- Banner is NOT sticky — it scrolls with content (header is already `sticky top-0`, adding another sticky element would stack awkwardly)
- Add 2 i18n keys: `relay.disconnected.title` ("All relays disconnected"), `relay.disconnected.message` ("Comments and reactions cannot be sent or received")

**Files**: `src/lib/i18n/en.json`, `src/lib/i18n/ja.json`, `src/web/routes/+layout.svelte`

## Testing

- `t.ts` has compile-time completeness check (`_jaComplete: Record<TranslationKey, string> = ja`) — TypeScript will error if `ja.json` is missing any key from `en.json`
- E2E tests cover TrackInput placeholder visibility and ResolveLoader error display
- Touch target changes are CSS-only; visual regression checked manually
- Relay banner: manual verification in dev by disconnecting all relays

## Out of Scope

- #30: Tablet breakpoint optimization
- #31: Mobile horizontal overflow fixes
- Toast/notification system (#9)
