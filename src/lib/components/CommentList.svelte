<script lang="ts">
  import { useCommentProfilePreload } from '$features/comments/ui/comment-profile-preload.svelte.js';
  import type {
    Comment,
    PlaceholderComment,
    ReactionStats
  } from '$features/comments/domain/comment-model.js';
  import { createCommentListViewModel } from '$features/comments/ui/comment-list-view-model.svelte.js';
  import { allocateEmojiPopoverId } from './emoji-popover-id.js';
  import WaveformLoader from './WaveformLoader.svelte';
  import type { ContentId, ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { formatPosition } from '$shared/nostr/events.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import VirtualScrollList from './VirtualScrollList.svelte';
  import CommentCard from './CommentCard.svelte';
  import CommentFilterBar from './CommentFilterBar.svelte';

  interface Props {
    comments: Comment[];
    reactionIndex: Map<string, ReactionStats>;
    contentId: ContentId;
    provider: ContentProvider;
    loading?: boolean;
    getPlaceholders?: () => Map<string, PlaceholderComment>;
    fetchOrphanParent?: (parentId: string, positionMs: number | null) => void;
  }

  let {
    comments,
    reactionIndex,
    contentId,
    provider,
    loading = false,
    getPlaceholders,
    fetchOrphanParent
  }: Props = $props();

  // --- Virtual scroll auto-scroll ---
  let timedVirtualList = $state<VirtualScrollList<Comment> | undefined>();
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

  const popoverIds = new Map<string, string>();
  function getPopoverId(commentId: string): string {
    let pid = popoverIds.get(commentId);
    if (!pid) {
      pid = allocateEmojiPopoverId();
      popoverIds.set(commentId, pid);
    }
    return pid;
  }
</script>

<CommentFilterBar followFilter={vm.followFilter} onFilterChange={vm.setFollowFilter} />

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center gap-3 py-8" role="status" aria-live="polite">
      <WaveformLoader />
      <span class="text-sm text-text-muted">{t('loading')}</span>
    </div>
  {:else if vm.filteredComments.length === 0}
    <p class="py-8 text-center text-sm text-text-muted">
      {#if vm.followFilter !== 'all'}
        {vm.followFilter === 'follows' ? t('comment.none.follows') : t('comment.none.wot')}
      {:else}
        {t('comment.none')}
      {/if}
    </p>
  {:else}
    {#snippet orphanPlaceholder(placeholder: PlaceholderComment)}
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
        {#if vm.replyMap.get(placeholder.id)}
          <div class="mt-2 space-y-2 pl-4">
            {#each vm.replyMap.get(placeholder.id) ?? [] as reply (reply.id)}
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
                replies={[]}
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
                onReplyContentChange={(content) => (vm.replyContent = content)}
                onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}

    {#if vm.timedComments.length > 0 || vm.orphanParents.some((p) => p.positionMs !== null)}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold tracking-wide text-text-secondary uppercase"
            >{t('comment.section.timed')}</span
          >
          <span class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-mono text-accent"
            >{vm.timedComments.length}</span
          >
          <div class="h-px flex-1 bg-border-subtle"></div>
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
          <div class="max-h-[400px] overflow-hidden rounded-xl border border-border-subtle">
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
                  onReplyContentChange={(content) => (vm.replyContent = content)}
                  onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
                />
              {/snippet}
            </VirtualScrollList>
          </div>
        {/if}
      </section>
    {/if}

    {#if vm.generalComments.length > 0 || vm.orphanParents.some((p) => p.positionMs === null)}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold tracking-wide text-text-secondary uppercase"
            >{t('comment.section.general')}</span
          >
          <span class="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-mono text-text-muted"
            >{vm.generalComments.length}</span
          >
          <div class="h-px flex-1 bg-border-subtle"></div>
        </div>
        {#each vm.orphanParents.filter((p) => p.positionMs === null) as placeholder (placeholder.id)}
          {@render orphanPlaceholder(placeholder)}
        {/each}
        {#if vm.generalComments.length > 0}
          <div class="max-h-[400px] overflow-hidden rounded-xl border border-border-subtle">
            <VirtualScrollList
              items={vm.generalComments}
              keyFn={(c) => c.id}
              estimateHeight={120}
              overscan={3}
            >
              {#snippet children({ item: comment, index: i })}
                <CommentCard
                  {comment}
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
                  onReplyContentChange={(content) => (vm.replyContent = content)}
                  onReplyEmojiTagsChange={(tags) => (vm.replyEmojiTags = tags)}
                />
              {/snippet}
            </VirtualScrollList>
          </div>
        {/if}
      </section>
    {/if}
  {/if}
</div>

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
