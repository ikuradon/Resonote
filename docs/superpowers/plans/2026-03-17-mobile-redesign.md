# モバイルリデザイン Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 320-375px スマートフォンでの水平オーバーフローを修正し、ハンバーガーメニュー + フルスクリーンオーバーレイでモバイル UX を再設計する。

**Architecture:** 共通の `MobileOverlay.svelte` コンポーネントを作成し、ヘッダーメニュー・NotificationBell・RelayStatus・NoteInput で共有。`matchMedia('(min-width: 1024px)')` でモバイル/デスクトップを切替。モーダル系はマージン修正のみ。

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-17-mobile-redesign-design.md`

---

## File Structure

| File                                         | Action     | Responsibility                                      |
| -------------------------------------------- | ---------- | --------------------------------------------------- |
| `src/lib/components/MobileOverlay.svelte`    | **Create** | フルスクリーンオーバーレイ共通コンポーネント        |
| `src/web/routes/+layout.svelte`              | Modify     | ハンバーガーメニュー追加、モバイル/デスクトップ切替 |
| `src/lib/components/NotificationBell.svelte` | Modify     | matchMedia 切替 + MobileOverlay                     |
| `src/lib/components/RelayStatus.svelte`      | Modify     | ヘッダーメニュー内表示 + MobileOverlay              |
| `src/lib/components/NoteInput.svelte`        | Modify     | MobileOverlay でオートコンプリート                  |
| `src/lib/components/ShareButton.svelte`      | Modify     | max-w マージン修正                                  |
| `src/lib/components/ConfirmDialog.svelte`    | Modify     | max-w + mx マージン修正                             |
| ~~`src/lib/components/CommentList.svelte`~~  | No change  | font-mono は短い数値のみ、truncate 不要             |
| `e2e/responsive.test.ts`                     | Modify     | tablet viewport テスト更新                          |

---

## Chunk 1: MobileOverlay + ヘッダー + モーダル修正

### Task 1: MobileOverlay 共通コンポーネント作成

**Files:**

- Create: `src/lib/components/MobileOverlay.svelte`

- [ ] **Step 1: Create MobileOverlay.svelte**

```svelte
<script lang="ts">
  import { untrack } from 'svelte';

  let {
    open = false,
    onclose,
    title = ''
  }: {
    open: boolean;
    onclose: () => void;
    title?: string;
  } = $props();

  let overlayEl: HTMLDivElement | undefined = $state();
  let titleId = `overlay-title-${Math.random().toString(36).slice(2, 8)}`;

  // Body scroll lock
  $effect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  });

  // Focus trap
  $effect(() => {
    if (!open || !overlayEl) return;
    const closeBtn = overlayEl.querySelector<HTMLElement>('[data-overlay-close]');
    closeBtn?.focus();

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onclose();
        return;
      }
      if (e.key !== 'Tab' || !overlayEl) return;
      const focusable = overlayEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <div
    bind:this={overlayEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    class="fixed inset-0 z-50 flex flex-col bg-surface-0/95 backdrop-blur-sm"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border-subtle px-5 py-4">
      {#if title}
        <h2 id={titleId} class="font-display text-lg font-semibold text-text-primary">{title}</h2>
      {:else}
        <div id={titleId}></div>
      {/if}
      <button
        type="button"
        data-overlay-close
        onclick={onclose}
        class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
        aria-label="Close"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-5 py-4">
      {@render children()}
    </div>
  </div>
{/if}
```

**Important**: The code above uses `{#snippet children()} <slot />` which is incorrect for Svelte 5. The correct pattern is:

- Props: `let { open, onclose, title, children }: { ...; children: Snippet } = $props();` (import `Snippet` from `'svelte'`)
- Template: Use `{@render children()}` directly (no `{#snippet}` or `<slot>`)
- Callers use `{#snippet children()}...{/snippet}` to pass content

Check existing components like `+layout.svelte` for the `Snippet` pattern used in this codebase.

- [ ] **Step 2: Run lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/MobileOverlay.svelte
git commit -m "Add MobileOverlay shared component with focus trap and scroll lock"
```

---

### Task 2: ハンバーガーメニュー追加 (+layout.svelte)

**Files:**

- Modify: `src/web/routes/+layout.svelte`

- [ ] **Step 1: Add mobile header with hamburger button**

In `+layout.svelte`, the current header (lines 78-161) needs:

1. Import `MobileOverlay`
2. Add `let menuOpen = $state(false)` state
3. Split header into mobile (`lg:hidden`) and desktop (`hidden lg:flex`) versions
4. Mobile header: `[Logo] ... [NotificationBell] [☰ button]`
5. ☰ button opens MobileOverlay with menu items

The mobile menu items should include:

- Language switcher (inline buttons, not dropdown): read the locales from `src/lib/i18n/locales.ts` and render each as a button
- Relays link (opens RelayStatus overlay — separate from this menu)
- Bookmarks link (`/bookmarks`)
- Settings link (`/settings`)
- Login button

- [ ] **Step 2: Run full pre-commit validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/+layout.svelte
git commit -m "Add hamburger menu with fullscreen overlay for mobile header"
```

---

### Task 3: ShareButton + ConfirmDialog マージン修正

**Files:**

- Modify: `src/lib/components/ShareButton.svelte:145`
- Modify: `src/lib/components/ConfirmDialog.svelte:51`

- [ ] **Step 1: Fix ShareButton modal width**

In `ShareButton.svelte` line 145, change:

```
class="mx-4 w-full max-w-sm rounded-2xl ...
```

to:

```
class="mx-4 w-full max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-2xl ...
```

- [ ] **Step 2: Fix ConfirmDialog modal width**

In `ConfirmDialog.svelte` line 51, change:

```
class="animate-slide-up relative w-full max-w-sm rounded-2xl ...
```

to:

```
class="animate-slide-up relative mx-3 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-sm rounded-2xl ...
```

- [ ] **Step 3: Run validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ShareButton.svelte src/lib/components/ConfirmDialog.svelte
git commit -m "Fix modal overflow on small viewports with max-w viewport constraint"
```

---

## Chunk 2: NotificationBell + RelayStatus + NoteInput

### Task 4: NotificationBell mobile overlay

**Files:**

- Modify: `src/lib/components/NotificationBell.svelte`

- [ ] **Step 1: Add matchMedia-based isDesktop state and MobileOverlay**

Add to the script section:

```typescript
import MobileOverlay from './MobileOverlay.svelte';

let isDesktop = $state(true);
$effect(() => {
  const mql = window.matchMedia('(min-width: 1024px)');
  isDesktop = mql.matches;
  function handler(e: MediaQueryListEvent) {
    isDesktop = e.matches;
  }
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
});
```

- [ ] **Step 2: Split template into desktop dropdown and mobile overlay**

Wrap the existing dropdown in `{#if isDesktop}` and add `{:else}` with MobileOverlay containing the same notification list markup.

The existing notification list markup (the scrollable list inside the `w-80` dropdown) should be extracted or duplicated into the MobileOverlay's slot.

- [ ] **Step 3: Run validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/NotificationBell.svelte
git commit -m "Add fullscreen overlay for notifications on mobile"
```

---

### Task 5: RelayStatus mobile overlay

**Files:**

- Modify: `src/lib/components/RelayStatus.svelte`

- [ ] **Step 1: Add matchMedia + MobileOverlay**

Same pattern as NotificationBell:

- Import MobileOverlay
- Add `isDesktop` state with matchMedia
- `{#if isDesktop}` → existing `w-64` dropdown
- `{:else}` → MobileOverlay with relay list

- [ ] **Step 2: Run validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/RelayStatus.svelte
git commit -m "Add fullscreen overlay for relay status on mobile"
```

---

### Task 6: NoteInput autocomplete mobile overlay

**Files:**

- Modify: `src/lib/components/NoteInput.svelte`

- [ ] **Step 1: Add matchMedia + MobileOverlay for autocomplete**

Same pattern:

- Import MobileOverlay
- Add `isDesktop` state
- Desktop: existing `w-64` absolute dropdown
- Mobile: MobileOverlay with autocomplete candidates as a scrollable list

Note: The autocomplete triggers when `:` is typed. On mobile, the MobileOverlay should open with the same candidates and allow selection. When selected, close overlay and insert the emoji shortcode.

- [ ] **Step 2: Run validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/NoteInput.svelte
git commit -m "Add fullscreen overlay for emoji autocomplete on mobile"
```

---

## Chunk 3: font-mono truncate + E2E テスト更新

### Task 7: font-mono truncate 修正

**Files:**

- Modify: `src/web/routes/bookmarks/+page.svelte:94`
- Modify: `src/lib/components/CommentList.svelte` (multiple lines)

- [ ] **Step 1: Add truncate to bookmark value display**

In `bookmarks/+page.svelte` line 94, the `font-mono` span displaying bookmark entries should have `truncate` class and a parent with `min-w-0` if in a flex container.

- [ ] **Step 2: Review CommentList font-mono usages**

The `font-mono` in `CommentList.svelte` is used for:

- Line 361: timed comment position badge (`rounded-full ... font-mono text-xs`) — short values like "1:23", no overflow risk
- Lines 429, 435, 452: reaction counts — numeric, short, no risk
- Lines 616, 651, 688: WoT/timed/general count badges — short, no risk

Most `font-mono` in CommentList are short numeric values. No truncation needed.

- [ ] **Step 3: Run validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/bookmarks/+page.svelte
git commit -m "Add truncate to font-mono bookmark entries for mobile overflow"
```

---

### Task 8: E2E テスト更新

**Files:**

- Modify: `e2e/responsive.test.ts`

- [ ] **Step 1: Update mobile viewport test for hamburger menu**

In `responsive.test.ts` line 12, the mobile test expects `login-button` to be visible. After the redesign, on 375px the login button is inside the hamburger menu. Update:

```typescript
test('should display correctly on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Resonote');
  await expect(page.locator('[data-testid="track-url-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="track-submit-button"]')).toBeVisible();
  // Login button is inside hamburger menu on mobile
  await expect(page.locator('[data-testid="hamburger-menu-button"]')).toBeVisible();
});
```

- [ ] **Step 2: Update tablet viewport test**

In `responsive.test.ts` lines 40-45, 768px is below `lg:` (1024px) so it gets mobile layout. Update to verify hamburger menu is present:

```typescript
test('should display correctly on tablet viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Resonote');
  await expect(page.locator('[data-testid="track-url-input"]')).toBeVisible();
  // Tablet gets mobile layout (< lg breakpoint)
  await expect(page.locator('[data-testid="hamburger-menu-button"]')).toBeVisible();
});
```

- [ ] **Step 3: Run full validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/responsive.test.ts
git commit -m "Update E2E responsive tests for hamburger menu on mobile/tablet

Closes #31"
```

---

## Parallelization

- **Task 3** (モーダルマージン修正) と **Task 7** (font-mono) は Task 1 に依存しない → Task 1 と並列実行可能
- **Task 4, 5, 6** は全て Task 1 に依存するが互いに独立 → Task 1 完了後に並列実行可能
- **Task 8** (E2E) は Task 2 に依存 → 最後に実行

## Pre-commit checks (MUST run before every commit)

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```
