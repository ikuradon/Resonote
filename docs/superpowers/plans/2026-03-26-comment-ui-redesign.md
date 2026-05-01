# Comment UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the comment section with 3-tab layout (Flow/Shout/Info), bottom-sticky form, chat-style Shout TL, and always-visible Flow tab with empty state CTA.

**Architecture:** Tab state lives in `comment-list-view-model`. Active tab drives which comments to display (Flow=timed sorted by position, Shout=general sorted by createdAt ascending), which form mode to use (timed vs general), and which action layout to render (compact vs full). CommentForm moves inside CommentList as a sticky footer. CommentActionMenu is a new shared popover component.

**Tech Stack:** SvelteKit, Svelte 5 runes, Tailwind CSS v4, VirtualScrollList (existing)

**Spec:** `docs/superpowers/specs/2026-03-26-comment-ui-redesign.md`

---

### Task 1: i18n Keys + Viewport Meta

**Files:**

- Modify: `src/shared/i18n/en.json`
- Modify: `src/shared/i18n/ja.json`
- Modify: all other locale JSON files (`de`, `es`, `fr`, `ko`, `pt_br`, `zh_cn`, `ja_osaka`)
- Modify: `src/web/app.html`

- [ ] **Step 1: Add new i18n keys to `en.json`**

Add these keys (replacing old `comment.section.timed`, `comment.section.general`, `comment.timed`, `comment.general`):

```json
"tab.flow": "Flow",
"tab.shout": "Shout",
"tab.info": "Info",
"comment.placeholder.flow": "Add a flow comment...",
"comment.placeholder.shout": "Shout something...",
"comment.empty.flow.title": "Play to comment",
"comment.empty.flow.subtitle": "Comments synced to playback position will appear here",
"comment.empty.shout": "No comments yet",
"menu.quote": "Quote",
"menu.custom_emoji": "Custom Emoji",
"menu.copy_id": "Copy ID",
"menu.broadcast": "Broadcast",
"menu.mute_user": "Mute User",
"menu.mute_thread": "Mute Thread",
"menu.delete": "Delete",
"menu.copied": "Copied!",
"shout.jump_to_latest": "Jump to latest"
```

Keep old keys (`comment.section.timed`, `comment.section.general`, `comment.timed`, `comment.general`) for now — remove in a cleanup step after all references are migrated.

- [ ] **Step 2: Add corresponding keys to `ja.json`**

```json
"tab.flow": "フロー",
"tab.shout": "シャウト",
"tab.info": "情報",
"comment.placeholder.flow": "フローコメントを追加...",
"comment.placeholder.shout": "一言どうぞ...",
"comment.empty.flow.title": "再生してコメントを投稿しよう",
"comment.empty.flow.subtitle": "再生位置に紐づくコメントが表示されます",
"comment.empty.shout": "まだコメントはありません",
"menu.quote": "引用",
"menu.custom_emoji": "カスタム絵文字",
"menu.copy_id": "IDをコピー",
"menu.broadcast": "ブロードキャスト",
"menu.mute_user": "ユーザーをミュート",
"menu.mute_thread": "スレッドをミュート",
"menu.delete": "削除",
"menu.copied": "コピーしました",
"shout.jump_to_latest": "最新へ"
```

- [ ] **Step 3: Add keys to remaining locale files**

Copy the English keys to `de.json`, `es.json`, `fr.json`, `ko.json`, `pt_br.json`, `zh_cn.json`, `ja_osaka.json`. Use English values as placeholders (translation can be done later). Each file gets the same set of keys as Step 1.

- [ ] **Step 4: Add `interactive-widget` to viewport meta in `app.html`**

In `src/web/app.html`, change line 5:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, interactive-widget=resizes-content"
/>
```

- [ ] **Step 5: Run lint and type check**

```bash
pnpm lint && pnpm check
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/i18n/*.json src/web/app.html
git commit -m "feat: add i18n keys for comment UI redesign and viewport interactive-widget"
```

---

### Task 2: View Model — activeTab + Shout Sort

**Files:**

- Modify: `src/features/comments/ui/comment-list-view-model.svelte.ts`
- Modify: `src/features/comments/ui/comment-list-view-model.test.ts`

- [ ] **Step 1: Write failing tests for activeTab and shoutComments**

In `comment-list-view-model.test.ts`, add a new `describe` block:

```typescript
describe('activeTab', () => {
  it('defaults to flow', () => {
    const vm = createVM();
    expect(vm.activeTab).toBe('flow');
  });

  it('can be set to shout', () => {
    const vm = createVM();
    vm.setActiveTab('shout');
    expect(vm.activeTab).toBe('shout');
  });

  it('can be set to info', () => {
    const vm = createVM();
    vm.setActiveTab('info');
    expect(vm.activeTab).toBe('info');
  });
});

describe('shoutComments (chat-style sort)', () => {
  it('sorts general comments by createdAt ascending (oldest first)', () => {
    const comments = [
      makeComment({ id: 'a', createdAt: 300 }),
      makeComment({ id: 'b', createdAt: 100 }),
      makeComment({ id: 'c', createdAt: 200 })
    ];
    const vm = createVM({ comments });
    // shoutComments = generalComments re-sorted ascending
    expect(vm.shoutComments.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
});
```

Use existing test helpers (`createVM`, `makeComment`) from the test file — adapt as needed based on actual helper signatures.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts
```

Expected: FAIL — `activeTab`, `setActiveTab`, `shoutComments` not defined.

- [ ] **Step 3: Add activeTab state and shoutComments derived to view model**

In `comment-list-view-model.svelte.ts`:

1. Add type at top of file:

```typescript
export type CommentTab = 'flow' | 'shout' | 'info';
```

2. Inside `createCommentListViewModel`, after `let followFilter = $state<FollowFilter>('all');`:

```typescript
let activeTab = $state<CommentTab>('flow');
```

3. After the existing `generalComments` derived, add:

```typescript
let shoutComments = $derived([...generalComments].sort((a, b) => a.createdAt - b.createdAt));
```

4. Add setter function:

```typescript
function setActiveTab(tab: CommentTab): void {
  activeTab = tab;
}
```

5. Add to return object:

```typescript
get activeTab() { return activeTab; },
get shoutComments() { return shoutComments; },
setActiveTab,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/comments/ui/comment-list-view-model.svelte.ts src/features/comments/ui/comment-list-view-model.test.ts
git commit -m "feat: add activeTab state and shoutComments to comment list view model"
```

---

### Task 3: View Model — Shout Auto-Scroll Logic

**Files:**

- Modify: `src/features/comments/ui/comment-list-view-model.svelte.ts`
- Modify: `src/features/comments/ui/comment-list-view-model.test.ts`

- [ ] **Step 1: Write failing tests for Shout auto-scroll state**

```typescript
describe('shout auto-scroll', () => {
  it('shoutAtBottom defaults to true', () => {
    const vm = createVM();
    expect(vm.shoutAtBottom).toBe(true);
  });

  it('setShoutAtBottom(false) disables auto-follow', () => {
    const vm = createVM();
    vm.setShoutAtBottom(false);
    expect(vm.shoutAtBottom).toBe(false);
  });

  it('jumpToLatest sets shoutAtBottom back to true', () => {
    const vm = createVM();
    vm.setShoutAtBottom(false);
    vm.jumpToLatest();
    expect(vm.shoutAtBottom).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement shoutAtBottom state**

In `comment-list-view-model.svelte.ts`, inside the factory function:

```typescript
let shoutAtBottom = $state(true);

function setShoutAtBottom(atBottom: boolean): void {
  shoutAtBottom = atBottom;
}

function jumpToLatest(): void {
  shoutAtBottom = true;
}
```

Add to return object:

```typescript
get shoutAtBottom() { return shoutAtBottom; },
setShoutAtBottom,
jumpToLatest,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- src/features/comments/ui/comment-list-view-model.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/comments/ui/comment-list-view-model.svelte.ts src/features/comments/ui/comment-list-view-model.test.ts
git commit -m "feat: add shout auto-scroll state (shoutAtBottom, jumpToLatest)"
```

---

### Task 4: CommentActionMenu Component

**Files:**

- Create: `src/lib/components/CommentActionMenu.svelte`
- Create: `src/lib/components/comment-action-menu.test.ts` (optional — primarily visual component)

- [ ] **Step 1: Create the CommentActionMenu component**

Create `src/lib/components/CommentActionMenu.svelte`:

```svelte
<script lang="ts">
  import { neventEncode } from 'nostr-tools/nip19';

  import { toastSuccess } from '$shared/browser/toast.js';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    eventId: string;
    authorPubkey: string;
    isOwn: boolean;
    canMute: boolean;
    /** Actions already shown inline — exclude from menu */
    inlineActions?: Set<'reply' | 'like' | 'renote' | 'emoji'>;
    onQuote?: () => void;
    onCustomEmoji?: () => void;
    onMuteUser?: () => void;
    onMuteThread?: () => void;
    onDelete?: () => void;
    onBroadcast?: () => void;
  }

  let {
    eventId,
    authorPubkey,
    isOwn,
    canMute,
    inlineActions = new Set(),
    onQuote,
    onCustomEmoji,
    onMuteUser,
    onMuteThread,
    onDelete,
    onBroadcast
  }: Props = $props();

  let open = $state(false);

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  async function copyId() {
    const nevent = neventEncode({ id: eventId, relays: [], author: authorPubkey });
    await navigator.clipboard.writeText(`nostr:${nevent}`);
    toastSuccess(t('menu.copied'));
    close();
  }

  function handleAction(fn?: () => void) {
    fn?.();
    close();
  }
</script>

<div class="relative">
  <button
    type="button"
    onclick={toggle}
    class="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
    aria-label="More actions"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  </button>

  {#if open}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={close} onkeydown={close}></div>

    <!-- Menu -->
    <div
      class="absolute right-0 top-8 z-50 min-w-[180px] rounded-lg border border-border bg-surface-1 py-1 shadow-xl"
    >
      {#if onQuote && !inlineActions.has('reply')}
        <button
          type="button"
          onclick={() => handleAction(onQuote)}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          💬 {t('menu.quote')}
        </button>
      {/if}

      {#if onCustomEmoji && !inlineActions.has('emoji')}
        <button
          type="button"
          onclick={() => handleAction(onCustomEmoji)}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          😀 {t('menu.custom_emoji')}
        </button>
      {/if}

      <button
        type="button"
        onclick={copyId}
        class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
      >
        📋 {t('menu.copy_id')}
      </button>

      {#if onBroadcast}
        <button
          type="button"
          onclick={() => handleAction(onBroadcast)}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          📡 {t('menu.broadcast')}
        </button>
      {/if}

      <div class="my-1 h-px bg-border-subtle"></div>

      {#if canMute && !isOwn && onMuteUser}
        <button
          type="button"
          onclick={() => handleAction(onMuteUser)}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          🔇 {t('menu.mute_user')}
        </button>
      {/if}

      {#if onMuteThread}
        <button
          type="button"
          onclick={() => handleAction(onMuteThread)}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2"
        >
          🔕 {t('menu.mute_thread')}
        </button>
      {/if}

      {#if isOwn && onDelete}
        <button
          type="button"
          onclick={() => handleAction(onDelete)}
          class="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-surface-2"
        >
          🗑 {t('menu.delete')}
        </button>
      {/if}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Run lint and type check**

```bash
pnpm lint && pnpm check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CommentActionMenu.svelte
git commit -m "feat: add CommentActionMenu popover component"
```

---

### Task 5: CommentCard — Dual Action Layout (Flow Compact / Shout Full)

**Files:**

- Modify: `src/lib/components/CommentCard.svelte`

This task adds a `mode` prop to CommentCard that switches between Flow (compact inline actions) and Shout (full action row) layouts. The existing action buttons are replaced with the new layouts + CommentActionMenu.

- [ ] **Step 1: Add `mode` prop and import CommentActionMenu**

In `CommentCard.svelte`, add to Props interface:

```typescript
mode?: 'flow' | 'shout';
```

Add to destructuring with default:

```typescript
mode = 'flow',
```

Add import:

```typescript
import CommentActionMenu from './CommentActionMenu.svelte';
```

- [ ] **Step 2: Replace the existing action buttons section**

Find the current action area (the `♡ 2` / `↩` buttons area after the comment content) and replace with two mode-conditional renders:

**Flow mode** — compact right-aligned icons in the header row:

```svelte
{#if mode === 'flow'}
  <div class="flex items-center gap-1 flex-shrink-0">
    {#if loggedIn}
      <button type="button" onclick={() => onReply(comment)}
        class="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
        title={t('comment.reply.placeholder')}>
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    {/if}
    <button type="button" onclick={() => onReaction(comment)}
      class="flex items-center gap-1 rounded p-1 text-xs transition-colors
        {myReaction ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill={myReaction ? 'currentColor' : 'none'}
        stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      {#if stats.likeCount > 0}<span>{stats.likeCount}</span>{/if}
    </button>
    <CommentActionMenu
      eventId={comment.id} authorPubkey={comment.pubkey}
      isOwn={isOwn} {canMute}
      inlineActions={new Set(['reply', 'like'])}
      onQuote={onQuote ? () => onQuote!(comment) : undefined}
      onCustomEmoji={() => {/* open emoji picker via popoverId */}}
      onMuteUser={() => onMute(comment.pubkey)}
      onDelete={() => onDelete(comment)}
    />
  </div>
{/if}
```

**Shout mode** — full action row below content:

```svelte
{#if mode === 'shout'}
  <!-- Emoji reaction pills (if any custom emoji reactions exist) -->
  {#if stats.customEmoji.length > 0}
    <div class="mt-1 flex flex-wrap gap-1 {compact ? '' : 'ml-9'}">
      {#each stats.customEmoji as emoji}
        <span class="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-xs">
          {emoji.content} {emoji.count}
        </span>
      {/each}
    </div>
  {/if}
  <!-- Action row -->
  <div class="mt-1.5 flex gap-1 {compact ? '' : 'ml-9'}">
    {#if loggedIn}
      <button type="button" onclick={() => onReply(comment)}
        class="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary">
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Reply
        {#if (replyMap?.get(comment.id)?.length ?? 0) > 0}
          <span class="text-text-muted">{replyMap?.get(comment.id)?.length}</span>
        {/if}
      </button>
      <!-- ReNote button (placeholder — full implementation in future task) -->
      <button type="button" disabled
        class="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-muted opacity-50">
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
        ReNote
      </button>
    {/if}
    <button type="button" onclick={() => onReaction(comment)}
      class="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs transition-colors
        {myReaction ? 'border-accent/30 text-accent' : 'text-text-muted hover:text-text-secondary'}">
      <svg class="h-3 w-3" viewBox="0 0 24 24" fill={myReaction ? 'currentColor' : 'none'}
        stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      {#if stats.likeCount > 0}{stats.likeCount}{/if}
    </button>
    {#if loggedIn}
      <!-- Emoji picker trigger -->
      <button type="button"
        class="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
        popovertarget={popoverId}>
        😀+
      </button>
    {/if}
    <CommentActionMenu
      eventId={comment.id} authorPubkey={comment.pubkey}
      isOwn={isOwn} {canMute}
      inlineActions={new Set(['reply', 'like', 'renote', 'emoji'])}
      onQuote={onQuote ? () => onQuote!(comment) : undefined}
      onMuteUser={() => onMute(comment.pubkey)}
      onDelete={() => onDelete(comment)}
    />
  </div>
{/if}
```

Note: The exact integration point depends on the existing CommentCard template. The key changes are: (1) remove the old inline `♡ 2 ↩` area, (2) add mode-conditional rendering, (3) move Flow actions to the header row (alongside avatar/name/timestamp).

- [ ] **Step 3: Run lint and type check**

```bash
pnpm lint && pnpm check
```

Expected: PASS (there may be warnings about unused old code — clean up as needed)

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/CommentCard.svelte
git commit -m "feat: add dual action layout to CommentCard (flow compact / shout full)"
```

---

### Task 6: CommentList — Tab UI + Empty State

**Files:**

- Modify: `src/lib/components/CommentList.svelte`

This is the largest single task. It replaces the stacked Timed/General sections with a 3-tab interface.

- [ ] **Step 1: Import CommentTab type and add tab state binding**

At the top of the `<script>` block, add:

```typescript
import type { CommentTab } from '$features/comments/ui/comment-list-view-model.svelte.js';
```

- [ ] **Step 2: Replace the heading and filter bar area**

Replace the existing `<CommentFilterBar>` and everything before the sections with:

```svelte
<!-- Heading row with integrated filter -->
<div class="flex items-center gap-2">
  <span class="text-sm font-semibold text-text-primary">{t('comment.heading')}</span>
  <div class="h-px flex-1 bg-border-subtle"></div>
  <CommentFilterBar followFilter={vm.followFilter} onFilterChange={vm.setFollowFilter} />
</div>

<!-- Tab bar -->
<div class="flex border-b border-border-subtle">
  <button
    type="button"
    onclick={() => vm.setActiveTab('flow')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {vm.activeTab === 'flow'
      ? 'border-b-2 border-accent text-accent -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    🎶 <span class="hidden sm:inline">{t('tab.flow')}</span>
    {#if vm.timedComments.length > 0}
      <span class="text-xs opacity-70">({vm.timedComments.length})</span>
    {/if}
  </button>
  <button
    type="button"
    onclick={() => vm.setActiveTab('shout')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {vm.activeTab === 'shout'
      ? 'border-b-2 border-amber-500 text-amber-500 -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    📢 <span class="hidden sm:inline">{t('tab.shout')}</span>
    {#if vm.shoutComments.length > 0}
      <span class="text-xs opacity-70">({vm.shoutComments.length})</span>
    {/if}
  </button>
  <button
    type="button"
    onclick={() => vm.setActiveTab('info')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {vm.activeTab === 'info'
      ? 'border-b-2 border-text-secondary text-text-secondary -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    ℹ️ <span class="hidden sm:inline">{t('tab.info')}</span>
  </button>
</div>
```

- [ ] **Step 3: Replace stacked sections with tab content**

Replace the `{#if vm.timedComments.length > 0 ...}` and `{#if vm.generalComments.length > 0 ...}` blocks with a single tab-content block:

```svelte
{#if loading}
  <div class="flex items-center justify-center gap-3 py-8" role="status" aria-live="polite">
    <WaveformLoader />
    <span class="text-sm text-text-muted">{t('loading')}</span>
  </div>
{:else if vm.activeTab === 'flow'}
  <!-- Flow tab content -->
  {#if vm.timedComments.length === 0}
    <!-- Empty state CTA -->
    <div class="flex flex-col items-center justify-center gap-3 py-12">
      <div
        class="flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/10"
      >
        <span class="text-2xl text-accent">▶</span>
      </div>
      <div class="text-center">
        <p class="text-sm font-semibold text-text-secondary">{t('comment.empty.flow.title')}</p>
        <p class="mt-1 text-xs text-text-muted">{t('comment.empty.flow.subtitle')}</p>
      </div>
    </div>
  {:else}
    {#if vm.userScrolledAway}
      <div class="flex justify-center py-1">
        <button
          type="button"
          onclick={vm.jumpToNow}
          class="rounded-lg bg-accent/20 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
        >
          {t('comment.jump_to_now')}
        </button>
      </div>
    {/if}
    <div class="flex max-h-[400px] flex-col rounded-xl border border-border-subtle">
      <VirtualScrollList
        bind:this={timedVirtualList}
        items={vm.timedComments}
        keyFn={(c) => c.id}
        estimateHeight={120}
        overscan={3}
        onRangeChange={vm.handleTimedRangeChange}
      >
        {#snippet children({ item: comment, index: i })}
          <!-- Use existing CommentCard render with mode="flow" -->
          <CommentCard
            {comment}
            mode="flow"
            author={vm.authorDisplayFor(comment.pubkey)}
            index={i}
            showPosition={true}
            nearCurrent={comment.positionMs !== null &&
              vm.isNearCurrentPosition(comment.positionMs)}
            stats={vm.statsFor(comment.id)}
            myReaction={vm.myReactionFor(comment.id)}
            isOwn={vm.isOwn(comment.pubkey)}
            acting={vm.isActing(comment.id)}
            loggedIn={vm.loggedIn}
            revealedCW={vm.isRevealed(comment.id)}
            canMute={vm.canMute}
            popoverId={getPopoverId(comment.id)}
            replyOpen={vm.isReplyOpen(comment.id)}
            bind:replyContent={vm.replyContent}
            bind:replyEmojiTags={vm.replyEmojiTags}
            replySending={vm.replySending}
            replies={vm.replyMap.get(comment.id) ?? []}
            getAuthorDisplay={vm.authorDisplayFor}
            getStats={vm.statsFor}
            getMyReaction={vm.myReactionFor}
            isActing={vm.isActing}
            isRevealed={vm.isRevealed}
            {getPopoverId}
            onReaction={vm.sendReaction}
            onDelete={vm.requestDelete}
            onReply={vm.startReply}
            onCancelReply={vm.cancelReply}
            onSubmitReply={vm.submitReply}
            onSeek={vm.seekToPosition}
            onRevealCW={vm.revealCW}
            onHideCW={vm.hideCW}
            onMute={vm.requestMute}
            {onQuote}
            onReplyContentChange={(content) => (vm.replyContent = content)}
            onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
          />
        {/snippet}
      </VirtualScrollList>
    </div>
  {/if}
{:else if vm.activeTab === 'shout'}
  <!-- Shout tab content (chat style) -->
  {#if vm.shoutComments.length === 0}
    <p class="py-12 text-center text-sm text-text-muted">{t('comment.empty.shout')}</p>
  {:else}
    {#if !vm.shoutAtBottom}
      <div class="flex justify-center py-1">
        <button
          type="button"
          onclick={vm.jumpToLatest}
          class="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/30"
        >
          {t('shout.jump_to_latest')}
        </button>
      </div>
    {/if}
    <div class="flex max-h-[400px] flex-col rounded-xl border border-border-subtle">
      <VirtualScrollList
        items={vm.shoutComments}
        keyFn={(c) => c.id}
        estimateHeight={120}
        overscan={3}
      >
        {#snippet children({ item: comment, index: i })}
          <CommentCard
            {comment}
            mode="shout"
            author={vm.authorDisplayFor(comment.pubkey)}
            index={i}
            showPosition={false}
            stats={vm.statsFor(comment.id)}
            myReaction={vm.myReactionFor(comment.id)}
            isOwn={vm.isOwn(comment.pubkey)}
            acting={vm.isActing(comment.id)}
            loggedIn={vm.loggedIn}
            revealedCW={vm.isRevealed(comment.id)}
            canMute={vm.canMute}
            popoverId={getPopoverId(comment.id)}
            replyOpen={vm.isReplyOpen(comment.id)}
            bind:replyContent={vm.replyContent}
            bind:replyEmojiTags={vm.replyEmojiTags}
            replySending={vm.replySending}
            replies={vm.replyMap.get(comment.id) ?? []}
            getAuthorDisplay={vm.authorDisplayFor}
            getStats={vm.statsFor}
            getMyReaction={vm.myReactionFor}
            isActing={vm.isActing}
            isRevealed={vm.isRevealed}
            {getPopoverId}
            onReaction={vm.sendReaction}
            onDelete={vm.requestDelete}
            onReply={vm.startReply}
            onCancelReply={vm.cancelReply}
            onSubmitReply={vm.submitReply}
            onSeek={vm.seekToPosition}
            onRevealCW={vm.revealCW}
            onHideCW={vm.hideCW}
            onMute={vm.requestMute}
            {onQuote}
            onReplyContentChange={(content) => (vm.replyContent = content)}
            onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
          />
        {/snippet}
      </VirtualScrollList>
    </div>
  {/if}
{:else if vm.activeTab === 'info'}
  <!-- Info tab — populated in Task 8 when page route moves Share/Bookmark here -->
  <div class="space-y-4 py-4">
    <slot name="info" />
  </div>
{/if}
```

- [ ] **Step 4: Run lint and type check**

```bash
pnpm lint && pnpm check
```

Expected: PASS (may need to adjust imports/types)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/CommentList.svelte
git commit -m "feat: replace stacked sections with 3-tab UI (Flow/Shout/Info)"
```

---

### Task 7: CommentForm — Tab-Linked Bottom Sticky

**Files:**

- Modify: `src/lib/components/CommentForm.svelte`
- Modify: `src/features/comments/ui/comment-form-view-model.svelte.ts`
- Modify: `src/features/comments/ui/comment-form-view-model.test.ts`

- [ ] **Step 1: Add `activeTab` prop to CommentForm**

In `CommentForm.svelte`, add to Props:

```typescript
activeTab?: 'flow' | 'shout' | 'info';
```

Add to destructuring:

```typescript
activeTab = 'flow',
```

- [ ] **Step 2: Update view model — remove selectTimedComment/selectGeneralComment, add tab linkage**

In `comment-form-view-model.svelte.ts`:

1. Add `getActiveTab` to options interface:

```typescript
interface CommentFormViewModelOptions {
  getContentId: () => ContentId;
  getProvider: () => ContentProvider;
  getActiveTab?: () => 'flow' | 'shout' | 'info';
}
```

2. Replace `attachPosition` state and derived:

```typescript
// Remove: let attachPosition = $state(true);
// Replace effectiveAttach:
let effectiveAttach = $derived((options.getActiveTab?.() ?? 'flow') === 'flow' && hasPosition);
```

3. Update placeholder:

```typescript
let placeholder = $derived(
  (options.getActiveTab?.() ?? 'flow') === 'flow'
    ? t('comment.placeholder.flow')
    : t('comment.placeholder.shout')
);
```

4. Remove `selectTimedComment` and `selectGeneralComment` methods and their return entries.

- [ ] **Step 3: Update CommentForm template**

Remove the Timed/General toggle buttons (lines 96-119 of current CommentForm.svelte). The tab determines the mode now.

Make CW and emoji buttons appear only on textarea focus. Wrap them in a conditional:

```svelte
{#if focused}
  <div class="flex items-center gap-2 text-xs">
    <!-- CW button (existing) -->
    <!-- Emoji button (new) -->
    <button
      type="button"
      popovertarget="emoji-picker-form"
      class="rounded-full bg-surface-3 px-3 py-1 text-text-muted transition-colors hover:text-text-secondary"
    >
      😀
    </button>
  </div>
{/if}
```

Add `let focused = $state(false);` and bind to NoteInput focus/blur events.

Show timestamp badge only in Flow mode:

```svelte
{#if activeTab === 'flow'}
  <span
    class="font-mono text-xs {vm.hasPosition ? 'text-accent' : 'text-text-muted/40'}
    rounded-full bg-accent/10 px-2 py-0.5"
  >
    {vm.positionLabel ?? '--:--'}
  </span>
{/if}
```

Add sticky positioning class to the form wrapper:

```svelte
<form ... class="sticky bottom-0 z-10 border-t border-border-subtle bg-surface-0 p-3 space-y-2">
```

- [ ] **Step 4: Update form tests**

In `comment-form-view-model.test.ts`, update tests that reference `selectTimedComment`/`selectGeneralComment` — remove those test cases and add tests for tab-linked behavior.

- [ ] **Step 5: Run tests**

```bash
pnpm test -- src/features/comments/ui/comment-form-view-model.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/CommentForm.svelte src/features/comments/ui/comment-form-view-model.svelte.ts src/features/comments/ui/comment-form-view-model.test.ts
git commit -m "feat: tab-linked bottom sticky CommentForm with CW+emoji on focus"
```

---

### Task 8: Page Route — Move Share/Bookmark to Info Tab, Integrate Form

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`
- Modify: `src/lib/components/CommentList.svelte` (add info slot content)

- [ ] **Step 1: Move CommentForm inside CommentList**

In `+page.svelte`, remove the standalone `<CommentForm>` (line 217) and pass it into CommentList instead. CommentList now renders the form internally below the tab content.

Add new props to CommentList:

```typescript
// In CommentList Props:
contentId: ContentId;
provider: ContentProvider;
threadPubkeys?: string[];
```

CommentList creates its own CommentForm internally, positioned after the tab content area.

- [ ] **Step 2: Move Share/Bookmark buttons to Info tab**

In `+page.svelte`, remove the Share button and Bookmark button from the heading area (lines 160-175).

In CommentList, populate the Info tab with these elements passed via slot or props:

```svelte
{:else if vm.activeTab === 'info'}
  <div class="space-y-4 py-6 px-2">
    <div class="flex flex-col gap-3">
      <ShareButton {contentId} {provider} />
      {#if loggedIn}
        <button type="button" onclick={toggleBookmark} disabled={bookmarkBusy}
          class="...">
          {bookmarked ? '★ Remove Bookmark' : '☆ Add Bookmark'}
        </button>
      {/if}
      <a href={provider.getOpenUrl(contentId)} target="_blank" rel="noopener noreferrer"
        class="...">
        Open in {provider.displayName} ↗
      </a>
    </div>
  </div>
{/if}
```

The exact props for bookmark state (`bookmarked`, `bookmarkBusy`, `toggleBookmark`) need to be passed from the page route through CommentList props or via a callback pattern.

- [ ] **Step 3: Hide form when Info tab is active**

In CommentList, conditionally render CommentForm:

```svelte
{#if vm.activeTab !== 'info' && vm.loggedIn}
  <CommentForm {contentId} {provider} {threadPubkeys} activeTab={vm.activeTab} />
{:else if !vm.loggedIn && vm.activeTab !== 'info'}
  <div class="...login prompt...">
    <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
  </div>
{/if}
```

- [ ] **Step 4: Run full validation suite**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte src/lib/components/CommentList.svelte
git commit -m "feat: integrate CommentForm into CommentList, move Share/Bookmark to Info tab"
```

---

### Task 9: CommentFilterBar — Heading Dropdown Integration

**Files:**

- Modify: `src/lib/components/CommentFilterBar.svelte`

- [ ] **Step 1: Convert to compact dropdown style**

Replace the pill-button layout with a dropdown `<select>` or custom dropdown that fits in the heading row:

```svelte
<div class="flex items-center">
  {#if auth.loggedIn}
    <select
      value={followFilter}
      onchange={(e) => onFilterChange(e.currentTarget.value as FollowFilter)}
      class="rounded-md border border-border-subtle bg-surface-1 px-2 py-1 text-xs text-text-muted"
    >
      {#each filterOptions as opt (opt.value)}
        <option value={opt.value}>{t(opt.labelKey)}</option>
      {/each}
    </select>
  {/if}
</div>
```

Remove the WoT building status and refresh button (move to Info tab later if needed).

- [ ] **Step 2: Run lint and type check**

```bash
pnpm lint && pnpm check
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CommentFilterBar.svelte
git commit -m "refactor: convert CommentFilterBar to compact dropdown for heading row"
```

---

### Task 10: Shout VirtualScrollList — Initial Scroll to Bottom + Scroll Tracking

**Files:**

- Modify: `src/lib/components/CommentList.svelte`

- [ ] **Step 1: Add shout VirtualScrollList ref and scroll-to-bottom logic**

In CommentList, add a ref for the Shout VirtualScrollList:

```typescript
let shoutVirtualList = $state<VirtualScrollList<Comment> | undefined>();
```

Add an `$effect` to scroll to bottom when Shout tab becomes active or new comments arrive:

```typescript
$effect(() => {
  if (
    vm.activeTab === 'shout' &&
    vm.shoutAtBottom &&
    shoutVirtualList &&
    vm.shoutComments.length > 0
  ) {
    shoutVirtualList.scrollToIndex(vm.shoutComments.length - 1);
  }
});
```

- [ ] **Step 2: Track scroll position for shoutAtBottom**

Add a scroll handler to the Shout VirtualScrollList:

```svelte
<VirtualScrollList
  bind:this={shoutVirtualList}
  items={vm.shoutComments}
  keyFn={(c) => c.id}
  estimateHeight={120}
  overscan={3}
  onRangeChange={(start, end) => {
    // At bottom when the last visible item is the last comment
    vm.setShoutAtBottom(end >= vm.shoutComments.length - 1);
  }}
>
```

- [ ] **Step 3: Run lint and type check**

```bash
pnpm lint && pnpm check
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/CommentList.svelte
git commit -m "feat: shout tab scroll-to-bottom with auto-follow tracking"
```

---

### Task 11: Remove Old i18n Keys + Clean Up Dead Code

**Files:**

- Modify: `src/shared/i18n/*.json` (all locale files)
- Modify: various files that reference old keys

- [ ] **Step 1: Remove deprecated i18n keys**

From all locale JSON files, remove:

```
"comment.section.timed"
"comment.section.general"
"comment.timed"
"comment.general"
"comment.placeholder.timed"
"comment.placeholder.general"
```

- [ ] **Step 2: Search for remaining references to old keys**

```bash
pnpm exec grep -r "comment\.section\.\|comment\.timed\|comment\.general\|selectTimedComment\|selectGeneralComment" src/
```

Fix any remaining references.

- [ ] **Step 3: Run full validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated comment i18n keys and dead code"
```

---

### Task 12: E2E Test Updates

**Files:**

- Modify: `e2e/*.test.ts` (tests referencing comment sections)

- [ ] **Step 1: Identify affected E2E tests**

```bash
pnpm exec grep -rl "section\.timed\|section\.general\|comment-form\|Timed\|General" e2e/
```

- [ ] **Step 2: Update selectors and expectations**

Replace references to timed/general section headers with tab selectors. For example:

- Old: look for "Time Comments" / "General" section headers
- New: look for Flow/Shout tab buttons, click to switch tabs
- Update `data-testid` references if changed

- [ ] **Step 3: Run E2E tests**

```bash
pnpm test:e2e
```

Expected: PASS (with updated selectors)

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test: update E2E tests for tab-based comment UI"
```

---

### Task 13: Final Validation

- [ ] **Step 1: Run full pre-commit validation suite**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: ALL PASS

- [ ] **Step 2: Visual smoke test**

```bash
pnpm run dev
```

Check:

1. Flow tab shows empty state CTA when no timed comments
2. Shout tab shows chat-style TL (oldest on top, newest at bottom)
3. Tab switching works on desktop and mobile viewport
4. Form appears/hides correctly per tab
5. ⋮ menu opens with all expected items
6. Filter dropdown works in heading row

- [ ] **Step 3: Final commit if any fixes needed**

```bash
pnpm format && git add -A
git commit -m "fix: address visual issues from final smoke test"
```
