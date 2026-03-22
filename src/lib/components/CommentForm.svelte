<script lang="ts">
  import { createCommentFormViewModel } from '$features/comments/ui/comment-form-view-model.svelte.js';
  import { toastSuccess, toastError } from '$shared/browser/toast.js';
  import type { ContentId, ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { tick } from 'svelte';
  import NoteInput from './NoteInput.svelte';
  import SendButton from './SendButton.svelte';

  interface Props {
    contentId: ContentId;
    provider: ContentProvider;
  }

  let { contentId, provider }: Props = $props();

  const vm = createCommentFormViewModel({
    getContentId: () => contentId,
    getProvider: () => provider
  });

  let formEl = $state<HTMLFormElement | null>(null);

  export function insertQuote(eventId: string, authorPubkey: string): void {
    vm.insertQuote(eventId, authorPubkey);
    tick().then(() => {
      formEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const textarea = formEl?.querySelector('textarea');
      textarea?.focus();
    });
  }

  async function submit() {
    const result = await vm.submit();
    if (result === 'sent') {
      toastSuccess(t('toast.comment_sent'));
      return;
    }
    if (result === 'failed') {
      toastError(t('toast.comment_failed'));
    }
  }
</script>

{#if vm.loggedIn}
  <form
    bind:this={formEl}
    data-testid="comment-form"
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
    class="space-y-2"
  >
    <div class="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={vm.busy || !vm.hasPosition}
        onclick={vm.selectTimedComment}
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200 {vm.effectiveAttach
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : vm.hasPosition && !vm.busy
            ? 'bg-surface-3 text-text-muted hover:text-text-secondary'
            : 'cursor-not-allowed bg-surface-3 text-text-muted/40'}"
      >
        <span class="font-mono">{vm.positionLabel ?? '--:--'}</span>
        <span>{t('comment.timed')}</span>
      </button>
      <button
        type="button"
        disabled={vm.busy}
        onclick={vm.selectGeneralComment}
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200 {!vm.effectiveAttach
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : 'bg-surface-3 text-text-muted hover:text-text-secondary'} disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('comment.general')}
      </button>
    </div>

    <div class="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={vm.busy}
        onclick={vm.toggleContentWarning}
        class="inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-all duration-200
          {vm.cwEnabled
          ? 'bg-yellow-500/15 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400'
          : 'bg-surface-3 text-text-muted hover:text-text-secondary'} disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          aria-hidden="true"
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {t('cw.label')}
      </button>
      {#if vm.cwEnabled}
        <input
          type="text"
          bind:value={vm.cwReason}
          disabled={vm.busy}
          aria-label={t('cw.reason_placeholder')}
          placeholder={t('cw.reason_placeholder')}
          class="flex-1 rounded-lg border border-border bg-surface-1 px-2 py-1 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none disabled:opacity-40"
        />
      {/if}
    </div>

    <NoteInput
      bind:content={vm.content}
      bind:emojiTags={vm.emojiTags}
      disabled={vm.busy}
      placeholder={vm.placeholder}
      rows={1}
      onsubmit={submit}
    >
      <SendButton sending={vm.sending} flying={vm.flying} disabled={!vm.content.trim()} />
    </NoteInput>
  </form>
{:else}
  <div
    data-testid="comment-login-prompt"
    class="rounded-xl border border-dashed border-border py-4 text-center"
  >
    <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
  </div>
{/if}
