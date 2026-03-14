<script lang="ts">
  import { buildComment, formatPosition } from '../nostr/events.js';
  import { castSigned } from '../nostr/client.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import { getPlayer } from '../stores/player.svelte.js';
  import type { ContentId, ContentProvider } from '../content/types.js';
  import { createLogger } from '../utils/logger.js';
  import { t } from '../i18n/t.js';
  import NoteInput from './NoteInput.svelte';
  import SendButton from './SendButton.svelte';

  const log = createLogger('CommentForm');

  interface Props {
    contentId: ContentId;
    provider: ContentProvider;
  }

  let { contentId, provider }: Props = $props();

  const auth = getAuth();
  const player = getPlayer();
  let content = $state('');
  let sending = $state(false);
  let flying = $state(false);
  let emojiTags = $state<string[][]>([]);
  let busy = $derived(sending || flying);
  let hasPosition = $derived(player.position > 0);
  let positionLabel = $derived(hasPosition ? formatPosition(player.position) : null);
  /** true = attach current playback position, false = general comment.
   *  Auto-falls back to false when no position is available. */
  let attachPosition = $state(true);
  let cwEnabled = $state(false);
  let cwReason = $state('');
  let effectiveAttach = $derived(attachPosition && hasPosition);

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || !auth.loggedIn) return;

    flying = true;
    try {
      const posMs = effectiveAttach ? player.position : undefined;
      const tags = emojiTags.length > 0 ? emojiTags : undefined;
      const params = buildComment(trimmed, contentId, provider, {
        positionMs: posMs,
        emojiTags: tags,
        contentWarning: cwEnabled ? cwReason : undefined
      });
      log.info('Sending comment', { positionMs: posMs, contentLength: trimmed.length });
      // Transition: airplane flies (400ms) → fade to spinner
      await new Promise((r) => setTimeout(r, 400));
      sending = true;
      flying = false;
      await castSigned(params);
      log.info('Comment sent successfully');
      content = '';
      emojiTags = [];
      cwEnabled = false;
      cwReason = '';
    } catch (err) {
      log.error('Failed to send comment', err);
    } finally {
      sending = false;
      flying = false;
    }
  }
</script>

{#if auth.loggedIn}
  <form
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
    class="space-y-2"
  >
    <div class="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={busy || !hasPosition}
        onclick={() => (attachPosition = true)}
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200
          {effectiveAttach
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : hasPosition && !busy
            ? 'bg-surface-3 text-text-muted hover:text-text-secondary'
            : 'cursor-not-allowed bg-surface-3 text-text-muted/40'}"
      >
        <span class="font-mono">{positionLabel ?? '--:--'}</span>
        <span>{t('comment.timed')}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onclick={() => (attachPosition = false)}
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200 {!effectiveAttach
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : 'bg-surface-3 text-text-muted hover:text-text-secondary'} disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('comment.general')}
      </button>
    </div>

    <div class="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={busy}
        onclick={() => (cwEnabled = !cwEnabled)}
        class="inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium transition-all duration-200
          {cwEnabled
          ? 'bg-yellow-500/15 text-yellow-600 ring-1 ring-yellow-500/30 dark:text-yellow-400'
          : 'bg-surface-3 text-text-muted hover:text-text-secondary'} disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
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
      {#if cwEnabled}
        <input
          type="text"
          bind:value={cwReason}
          disabled={busy}
          placeholder={t('cw.reason_placeholder')}
          class="flex-1 rounded-lg border border-border bg-surface-1 px-2 py-1 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none disabled:opacity-40"
        />
      {/if}
    </div>

    <NoteInput
      bind:content
      bind:emojiTags
      disabled={busy}
      placeholder={effectiveAttach
        ? t('comment.placeholder.timed')
        : t('comment.placeholder.general')}
      rows={1}
      onsubmit={submit}
    >
      <SendButton {sending} {flying} disabled={!content.trim()} />
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
