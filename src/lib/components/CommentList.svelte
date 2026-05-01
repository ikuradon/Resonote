<script lang="ts">
  import { tick } from 'svelte';

  import type {
    Comment,
    ContentReaction,
    PlaceholderComment,
    ReactionStats
  } from '$features/comments/domain/comment-model.js';
  import { createCommentListViewModel } from '$features/comments/ui/comment-list-view-model.svelte.js';
  import { useCommentProfilePreload } from '$features/comments/ui/comment-profile-preload.svelte.js';
  import type { ContentMetadata } from '$features/content-resolution/domain/content-metadata.js';
  import { getAuth } from '$shared/browser/auth.js';
  import { createKeyboardShortcuts } from '$shared/browser/keyboard-shortcuts.js';
  import { dispatchTogglePlayback } from '$shared/browser/playback-bridge.js';
  import { getPlayer } from '$shared/browser/player.js';
  import { dispatchSeek } from '$shared/browser/seek-bridge.js';
  import type { ContentId, ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { formatPosition } from '$shared/nostr/events.js';

  import CommentCard from './CommentCard.svelte';
  import CommentForm from './CommentForm.svelte';
  import CommentInfoTab from './CommentInfoTab.svelte';
  import CommentTabBar from './CommentTabBar.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { allocateEmojiPopoverId } from './emoji-popover-id.js';
  import ShareButton from './ShareButton.svelte';
  import ShortcutHelpDialog from './ShortcutHelpDialog.svelte';
  import VirtualScrollList from './VirtualScrollList.svelte';
  import WaveformLoader from './WaveformLoader.svelte';

  interface Props {
    comments: Comment[];
    reactionIndex: Map<string, ReactionStats>;
    contentId: ContentId;
    provider: ContentProvider;
    loading?: boolean;
    getPlaceholders?: () => Map<string, PlaceholderComment>;
    fetchOrphanParent?: (parentId: string, positionMs: number | null) => void;
    onQuote?: (comment: Comment) => void;
    threadPubkeys?: string[];
    bookmarked?: boolean;
    bookmarkBusy?: boolean;
    onToggleBookmark?: () => void;
    openUrl?: string;
    highlightCommentId?: string;
    contentMetadata?: ContentMetadata | null;
    contentMetadataLoading?: boolean;
    contentReactions?: ContentReaction[];
    onContentReactionClick?: () => void;
    contentReactionBusy?: boolean;
  }

  let {
    comments,
    reactionIndex,
    contentId,
    provider,
    loading = false,
    getPlaceholders,
    fetchOrphanParent,
    onQuote,
    threadPubkeys = [],
    bookmarked = false,
    bookmarkBusy = false,
    onToggleBookmark,
    openUrl,
    highlightCommentId,
    contentMetadata = null,
    contentMetadataLoading = false,
    contentReactions = [],
    onContentReactionClick,
    contentReactionBusy = false
  }: Props = $props();

  // --- Content reaction derived state ---
  const auth = getAuth();
  let contentReactionCount = $derived(contentReactions.length);
  let contentReactionMine = $derived(
    auth.pubkey ? contentReactions.some((cr: ContentReaction) => cr.pubkey === auth.pubkey) : false
  );

  // --- Bookmark dialog + share ref ---
  let bookmarkDialogOpen = $state(false);
  let shareButtonRef = $state<ShareButton | undefined>();

  function handleBookmarkClick(): void {
    bookmarkDialogOpen = true;
  }

  function confirmBookmark(): void {
    bookmarkDialogOpen = false;
    onToggleBookmark?.();
  }

  function cancelBookmark(): void {
    bookmarkDialogOpen = false;
  }

  function handleShareClick(): void {
    shareButtonRef?.openMenu();
  }

  // --- Keyboard shortcut state ---
  let selectedIndex = $state(-1);
  let shortcutHelpOpen = $state(false);

  // --- Virtual scroll auto-scroll ---
  let timedVirtualList = $state<VirtualScrollList<Comment> | undefined>();
  let shoutVirtualList = $state<VirtualScrollList<Comment> | undefined>();
  useCommentProfilePreload(() => comments);
  const vm = createCommentListViewModel({
    getComments: () => comments,
    getReactionIndex: () => reactionIndex,
    getContentId: () => contentId,
    getProvider: () => provider,
    getTimedList: () => timedVirtualList,
    getPlaceholders: () => getPlaceholders?.() ?? new Map(),
    fetchOrphanParent: (parentId, positionMs) => fetchOrphanParent?.(parentId, positionMs)
  });

  // --- Shout tab scroll position management ---
  // Save scroll position BEFORE DOM updates when leaving Shout tab (VirtualScrollList about to be destroyed).
  // Restore on return; first visit scrolls to bottom.
  let shoutSavedScrollTop: number | null = null;
  let shoutHasBeenShown = $state(false);
  let prevActiveTab: string = 'flow';

  $effect.pre(() => {
    const tab = vm.activeTab;
    if (prevActiveTab === 'shout' && tab !== 'shout' && shoutVirtualList) {
      shoutSavedScrollTop = shoutVirtualList.getScrollTop();
    }
    prevActiveTab = tab;
  });

  $effect(() => {
    if (vm.activeTab === 'shout' && shoutVirtualList && vm.shoutComments.length > 0) {
      const isInitial = !shoutHasBeenShown;
      const restoreOffset = shoutSavedScrollTop;
      if (isInitial) shoutHasBeenShown = true;
      if (restoreOffset !== null) shoutSavedScrollTop = null;

      void tick().then(() => {
        requestAnimationFrame(() => {
          if (isInitial) {
            // First time: scroll to bottom
            shoutVirtualList?.scrollToEnd();
          } else if (restoreOffset !== null) {
            // Returning from another tab: restore saved position
            shoutVirtualList?.scrollToOffset(restoreOffset);
          } else if (vm.shoutAtBottom) {
            // At bottom + new comment arrived: auto-follow
            shoutVirtualList?.scrollToEnd();
          }
        });
      });
    }
  });

  // --- Scroll to highlighted comment from URL hash ---
  let highlightHandled = $state<string | null>(null);
  $effect(() => {
    if (highlightCommentId === highlightHandled || !highlightCommentId || loading) return;
    const allComments = comments;
    if (allComments.length === 0) return;

    const target = allComments.find((c) => c.id === highlightCommentId);
    if (!target) return;

    highlightHandled = highlightCommentId;

    // Determine which tab the comment belongs to
    const isTimed = target.positionMs !== null && target.replyTo === null;
    const targetTab = isTimed ? 'flow' : 'shout';

    if (vm.activeTab !== targetTab) {
      vm.setActiveTab(targetTab as 'flow' | 'shout');
    }

    // Wait for tab content to render, then scroll to the comment
    void tick().then(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-comment-id="${CSS.escape(highlightCommentId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Brief highlight effect
        el?.classList.add('ring-2', 'ring-accent');
        setTimeout(() => el?.classList.remove('ring-2', 'ring-accent'), 3000);
      });
    });
  });

  const popoverIds = new Map<string, string>();
  function getPopoverId(commentId: string): string {
    let pid = popoverIds.get(commentId);
    if (!pid) {
      pid = allocateEmojiPopoverId();
      popoverIds.set(commentId, pid);
    }
    return pid;
  }

  let commentFormRef = $state<CommentForm | undefined>();

  function handleQuote(comment: Comment): void {
    if (onQuote) {
      onQuote(comment);
    } else {
      commentFormRef?.insertQuote(comment.id, comment.pubkey);
    }
  }

  // --- Podcast feed link ---
  let feedHref = $derived(
    contentId.platform === 'podcast' && contentId.type === 'episode'
      ? `/podcast/feed/${contentId.id.split(':')[0]}`
      : null
  );

  // --- Keyboard shortcuts ---
  const SEEK_STEP = 5000;

  let visibleComments = $derived(
    vm.activeTab === 'flow' ? vm.timedComments : vm.activeTab === 'shout' ? vm.shoutComments : []
  );

  let selectedComment = $derived(
    selectedIndex >= 0 && selectedIndex < visibleComments.length
      ? visibleComments[selectedIndex]
      : null
  );

  let activeVirtualList = $derived(
    vm.activeTab === 'flow'
      ? timedVirtualList
      : vm.activeTab === 'shout'
        ? shoutVirtualList
        : undefined
  );

  // Reset selection on tab change
  $effect(() => {
    void vm.activeTab;
    selectedIndex = -1;
  });

  // Initialize keyboard shortcuts + focus tracking
  $effect(() => {
    const s = createKeyboardShortcuts({
      focusForm: () => {
        if (vm.activeTab === 'info' || !vm.canWrite) return;
        commentFormRef?.focusInput();
      },
      switchToFlow: () => vm.setActiveTab('flow'),
      switchToShout: () => vm.setActiveTab('shout'),
      switchToInfo: () => vm.setActiveTab('info'),
      nextComment: () => {
        if (vm.activeTab === 'info') return;
        if (selectedIndex < visibleComments.length - 1) {
          selectedIndex += 1;
          activeVirtualList?.scrollToIndex(selectedIndex);
        }
      },
      prevComment: () => {
        if (vm.activeTab === 'info') return;
        if (selectedIndex > 0) {
          selectedIndex -= 1;
          activeVirtualList?.scrollToIndex(selectedIndex);
        } else if (selectedIndex === -1 && visibleComments.length > 0) {
          selectedIndex = 0;
          activeVirtualList?.scrollToIndex(0);
        }
      },
      replyToSelected: () => {
        if (!selectedComment || !vm.canWrite) return;
        vm.startReply(selectedComment);
      },
      likeSelected: () => {
        if (!selectedComment || !vm.canWrite) return;
        vm.sendReaction(selectedComment);
      },
      clearSelection: () => {
        selectedIndex = -1;
      },
      toggleBookmark: () => {
        if (!vm.canWrite) return;
        handleBookmarkClick();
      },
      openShare: () => {
        handleShareClick();
      },
      togglePlayback: () => {
        dispatchTogglePlayback();
      },
      seekBackward: () => {
        const player = getPlayer();
        dispatchSeek(Math.max(0, player.position - SEEK_STEP));
      },
      seekForward: () => {
        const player = getPlayer();
        dispatchSeek(Math.min(player.duration, player.position + SEEK_STEP));
      },
      showHelp: () => {
        shortcutHelpOpen = true;
      }
    });

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        s.setInputFocused(true);
      }
    }
    function onFocusOut(e: FocusEvent) {
      const rt = e.relatedTarget;
      if (
        !(rt instanceof HTMLInputElement) &&
        !(rt instanceof HTMLTextAreaElement) &&
        !(rt instanceof HTMLElement && rt.isContentEditable)
      ) {
        s.setInputFocused(false);
      }
    }
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      s.destroy();
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  });
</script>

<CommentTabBar
  activeTab={vm.activeTab}
  followFilter={vm.followFilter}
  timedCount={vm.timedComments.length}
  shoutCount={vm.shoutComments.length}
  onTabChange={vm.setActiveTab}
  onFilterChange={vm.setFollowFilter}
  loggedIn={vm.canWrite}
  {bookmarked}
  {bookmarkBusy}
  onBookmarkClick={handleBookmarkClick}
  onShareClick={handleShareClick}
  {contentReactionCount}
  {contentReactionMine}
  {contentReactionBusy}
  onContentReactionClick={() => onContentReactionClick?.()}
/>

<!-- Tab content -->
<div>
  {#snippet orphanPlaceholder(placeholder: PlaceholderComment)}
    {@const orphanReplies = vm.replyMap.get(placeholder.id) ?? []}
    <div class="rounded-lg border border-border-subtle bg-surface-secondary/30 px-4 py-3">
      <div class="flex items-center gap-2">
        {#if placeholder.positionMs !== null}
          <span class="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
            {formatPosition(placeholder.positionMs)}
          </span>
        {/if}
        <span class="text-sm italic text-text-muted">
          {#if placeholder.status === 'loading'}
            {t('comment.orphan.loading')}
          {:else if placeholder.status === 'not-found'}
            {t('comment.orphan.not_found')}
          {:else}
            {t('comment.orphan.deleted')}
          {/if}
        </span>
      </div>
      {#if orphanReplies.length > 0}
        <div class="mt-2 space-y-2 pl-4">
          {#each orphanReplies as reply (reply.id)}
            <CommentCard
              comment={reply}
              author={vm.authorDisplayFor(reply.pubkey)}
              index={0}
              mode={placeholder.positionMs !== null ? 'flow' : 'shout'}
              showPosition={reply.positionMs !== null}
              nearCurrent={false}
              stats={vm.statsFor(reply.id)}
              myReaction={vm.myReactionFor(reply.id)}
              isOwn={vm.isOwn(reply.pubkey)}
              acting={vm.isActing(reply.id)}
              loggedIn={vm.canWrite}
              revealedCW={vm.isRevealed(reply.id)}
              canMute={vm.canMute}
              popoverId={getPopoverId(reply.id)}
              replyOpen={vm.isReplyOpen(reply.id)}
              bind:replyContent={vm.replyContent}
              bind:replyEmojiTags={vm.replyEmojiTags}
              replySending={vm.replySending}
              replies={vm.replyMap.get(reply.id) ?? []}
              getAuthorDisplay={vm.authorDisplayFor}
              getStats={vm.statsFor}
              getMyReaction={vm.myReactionFor}
              isActing={vm.isActing}
              isRevealed={vm.isRevealed}
              {getPopoverId}
              onReaction={vm.sendReaction}
              onRepost={vm.sendRepost}
              onDelete={vm.requestDelete}
              onReply={vm.startReply}
              onCancelReply={vm.cancelReply}
              onSubmitReply={vm.submitReply}
              onSeek={vm.seekToPosition}
              onRevealCW={vm.revealCW}
              onHideCW={vm.hideCW}
              onMute={vm.requestMute}
              onQuote={handleQuote}
              getIsOwn={vm.isOwn}
              onReplyContentChange={(content) => (vm.replyContent = content)}
              onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}

  {#if loading}
    <div class="flex items-center justify-center gap-3 py-8" role="status" aria-live="polite">
      <WaveformLoader />
      <span class="text-sm text-text-muted">{t('loading')}</span>
    </div>
  {:else if vm.activeTab === 'flow'}
    {#if vm.timedComments.length === 0 && !vm.orphanParents.some((p) => p.positionMs !== null)}
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
      <section class="space-y-3 pt-3">
        {#each vm.orphanParents.filter((p) => p.positionMs !== null) as placeholder (placeholder.id)}
          {@render orphanPlaceholder(placeholder)}
        {/each}
        {#if vm.timedComments.length > 0}
          <div class="relative flex max-h-[400px] flex-col rounded-xl border border-border-subtle">
            {#if vm.userScrolledAway}
              <button
                type="button"
                onclick={vm.jumpToNow}
                class="absolute {vm.jumpDirection === 'up'
                  ? 'top-2'
                  : 'bottom-2'} right-2 z-30 rounded-lg bg-accent/90 px-3 py-1 text-xs font-medium text-white shadow-lg transition-colors hover:bg-accent"
              >
                {vm.jumpDirection === 'up' ? '↑' : '↓'}
                {t('comment.jump_to_now')}
              </button>
            {/if}
            <VirtualScrollList
              bind:this={timedVirtualList}
              items={vm.timedComments}
              keyFn={(c) => c.id}
              estimateHeight={120}
              overscan={3}
              onRangeChange={vm.handleTimedRangeChange}
            >
              {#snippet children({ item: comment, index: i })}
                <CommentCard
                  {comment}
                  author={vm.authorDisplayFor(comment.pubkey)}
                  index={i}
                  mode="flow"
                  showPosition={true}
                  selected={selectedIndex === i}
                  nearCurrent={comment.positionMs !== null &&
                    vm.isNearCurrentPosition(comment.positionMs)}
                  stats={vm.statsFor(comment.id)}
                  myReaction={vm.myReactionFor(comment.id)}
                  isOwn={vm.isOwn(comment.pubkey)}
                  acting={vm.isActing(comment.id)}
                  loggedIn={vm.canWrite}
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
                  onRepost={vm.sendRepost}
                  onDelete={vm.requestDelete}
                  onReply={vm.startReply}
                  onCancelReply={vm.cancelReply}
                  onSubmitReply={vm.submitReply}
                  onSeek={vm.seekToPosition}
                  onRevealCW={vm.revealCW}
                  onHideCW={vm.hideCW}
                  onMute={vm.requestMute}
                  onQuote={handleQuote}
                  onReplyContentChange={(content) => (vm.replyContent = content)}
                  onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
                />
              {/snippet}
            </VirtualScrollList>
          </div>
        {/if}
      </section>
    {/if}
  {:else if vm.activeTab === 'shout'}
    {#if vm.shoutComments.length === 0 && !vm.orphanParents.some((p) => p.positionMs === null)}
      <p class="py-12 text-center text-sm text-text-muted">{t('comment.empty.shout')}</p>
    {:else}
      <section class="space-y-3 pt-3">
        {#each vm.orphanParents.filter((p) => p.positionMs === null) as placeholder (placeholder.id)}
          {@render orphanPlaceholder(placeholder)}
        {/each}
        {#if vm.shoutComments.length > 0}
          <div class="relative flex max-h-[400px] flex-col rounded-xl border border-border-subtle">
            {#if !vm.shoutAtBottom}
              <button
                type="button"
                onclick={() => {
                  vm.jumpToLatest();
                  shoutVirtualList?.scrollToEnd();
                }}
                class="absolute bottom-2 right-2 z-30 rounded-lg bg-amber-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg transition-colors hover:bg-amber-500"
              >
                {t('shout.jump_to_latest')} ↓
              </button>
            {/if}
            <VirtualScrollList
              bind:this={shoutVirtualList}
              items={vm.shoutComments}
              keyFn={(c) => c.id}
              estimateHeight={120}
              overscan={3}
              onScrollMetrics={({ scrollTop, scrollHeight, clientHeight }) => {
                if (!shoutHasBeenShown || shoutVirtualList?.isAutoScrolling()) return;
                vm.setShoutAtBottom(scrollHeight - scrollTop - clientHeight < 50);
              }}
            >
              {#snippet children({ item: comment, index: i })}
                <CommentCard
                  {comment}
                  author={vm.authorDisplayFor(comment.pubkey)}
                  index={i}
                  mode="shout"
                  showPosition={false}
                  selected={selectedIndex === i}
                  stats={vm.statsFor(comment.id)}
                  myReaction={vm.myReactionFor(comment.id)}
                  isOwn={vm.isOwn(comment.pubkey)}
                  acting={vm.isActing(comment.id)}
                  loggedIn={vm.canWrite}
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
                  onRepost={vm.sendRepost}
                  onDelete={vm.requestDelete}
                  onReply={vm.startReply}
                  onCancelReply={vm.cancelReply}
                  onSubmitReply={vm.submitReply}
                  onSeek={vm.seekToPosition}
                  onRevealCW={vm.revealCW}
                  onHideCW={vm.hideCW}
                  onMute={vm.requestMute}
                  onQuote={handleQuote}
                  onReplyContentChange={(content) => (vm.replyContent = content)}
                  onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
                />
              {/snippet}
            </VirtualScrollList>
          </div>
        {/if}
      </section>
    {/if}
  {:else if vm.activeTab === 'info'}
    <CommentInfoTab
      metadata={contentMetadata}
      metadataLoading={contentMetadataLoading}
      {openUrl}
      subtitleHref={feedHref ?? undefined}
    />
  {/if}
</div>

{#if vm.activeTab !== 'info'}
  {#if vm.canWrite}
    <CommentForm
      bind:this={commentFormRef}
      {contentId}
      {provider}
      {threadPubkeys}
      activeTab={vm.activeTab}
    />
  {:else}
    <div
      data-testid="comment-login-prompt"
      class="rounded-xl border border-dashed border-border py-4 text-center"
    >
      <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
    </div>
  {/if}
{/if}

<ConfirmDialog
  open={vm.deleteDialogOpen}
  title={t('comment.delete.title')}
  message={t('comment.delete.message')}
  confirmLabel={t('comment.delete.confirm')}
  cancelLabel={t('comment.delete.cancel')}
  onConfirm={vm.confirmDelete}
  onCancel={vm.cancelDelete}
/>

<ConfirmDialog
  open={vm.muteDialogOpen}
  title={t('confirm.mute')}
  message={t('confirm.mute.detail', {
    before: vm.muteCount,
    after: vm.muteCount + 1
  })}
  confirmLabel={t('confirm.ok')}
  cancelLabel={t('confirm.cancel')}
  onConfirm={vm.confirmMute}
  onCancel={vm.cancelMute}
/>

<ConfirmDialog
  open={bookmarkDialogOpen}
  title={bookmarked ? t('bookmark.confirm.remove.title') : t('bookmark.confirm.add.title')}
  message={bookmarked ? t('bookmark.confirm.remove.message') : t('bookmark.confirm.add.message')}
  confirmLabel={t('confirm.ok')}
  cancelLabel={t('confirm.cancel')}
  variant="default"
  onConfirm={confirmBookmark}
  onCancel={cancelBookmark}
/>

<ShareButton bind:this={shareButtonRef} {contentId} {provider} headless />

<ShortcutHelpDialog open={shortcutHelpOpen} onClose={() => (shortcutHelpOpen = false)} />
