<script lang="ts">
  import type {
    Comment,
    PlaceholderComment,
    ReactionStats
  } from '$features/comments/domain/comment-model.js';
  import { createCommentListViewModel } from '$features/comments/ui/comment-list-view-model.svelte.js';
  import { useCommentProfilePreload } from '$features/comments/ui/comment-profile-preload.svelte.js';
  import type { ContentId, ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { formatPosition } from '$shared/nostr/events.js';

  import CommentCard from './CommentCard.svelte';
  import CommentFilterBar from './CommentFilterBar.svelte';
  import CommentForm from './CommentForm.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { allocateEmojiPopoverId } from './emoji-popover-id.js';
  import ShareButton from './ShareButton.svelte';
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
    openUrl
  }: Props = $props();

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

  // --- Shout tab scroll-to-bottom ---
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
</script>

<!-- Heading row with filter -->
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
              showPosition={reply.positionMs !== null}
              nearCurrent={false}
              stats={vm.statsFor(reply.id)}
              myReaction={vm.myReactionFor(reply.id)}
              isOwn={vm.isOwn(reply.pubkey)}
              acting={vm.isActing(reply.id)}
              loggedIn={vm.loggedIn}
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
        <div class="flex items-center gap-2">
          {#if vm.userScrolledAway}
            <button
              type="button"
              onclick={vm.jumpToNow}
              class="rounded-lg bg-accent/20 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
            >
              {t('comment.jump_to_now')}
            </button>
          {/if}
        </div>
        {#each vm.orphanParents.filter((p) => p.positionMs !== null) as placeholder (placeholder.id)}
          {@render orphanPlaceholder(placeholder)}
        {/each}
        {#if vm.timedComments.length > 0}
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
                <CommentCard
                  {comment}
                  author={vm.authorDisplayFor(comment.pubkey)}
                  index={i}
                  mode="flow"
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
        {#if vm.shoutComments.length > 0}
          <div class="max-h-[400px] overflow-hidden rounded-xl border border-border-subtle">
            <VirtualScrollList
              bind:this={shoutVirtualList}
              items={vm.shoutComments}
              keyFn={(c) => c.id}
              estimateHeight={120}
              overscan={3}
              onRangeChange={(start, end) => {
                vm.setShoutAtBottom(end >= vm.shoutComments.length - 1);
              }}
            >
              {#snippet children({ item: comment, index: i })}
                <CommentCard
                  {comment}
                  author={vm.authorDisplayFor(comment.pubkey)}
                  index={i}
                  mode="shout"
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
    <div class="space-y-3 py-6">
      {#if onToggleBookmark && vm.loggedIn}
        <button
          type="button"
          onclick={onToggleBookmark}
          disabled={bookmarkBusy}
          class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50
            {bookmarked
            ? 'bg-accent/10 text-accent hover:bg-accent/20'
            : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary'}"
        >
          {bookmarked ? '\u2605' : '\u2606'}
          {bookmarked ? t('bookmark.remove') : t('bookmark.add')}
        </button>
      {/if}
      <ShareButton {contentId} {provider} />
      {#if openUrl}
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          {t('content.open_and_comment')} &#8599;
        </a>
      {/if}
    </div>
  {/if}
</div>

{#if vm.activeTab !== 'info'}
  {#if vm.loggedIn}
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
