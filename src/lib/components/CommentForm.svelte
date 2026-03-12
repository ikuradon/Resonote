<script lang="ts">
  import { buildComment, formatPosition } from '../nostr/events.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import { getPlayer } from '../stores/player.svelte.js';
  import type { ContentId, ContentProvider } from '../content/types.js';
  import { createLogger } from '../utils/logger.js';

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
  let hasPosition = $derived(player.position > 0);
  let positionLabel = $derived(hasPosition ? formatPosition(player.position) : null);
  /** true = attach current playback position, false = general comment.
   *  Auto-falls back to false when no position is available. */
  let attachPosition = $state(true);
  let effectiveAttach = $derived(attachPosition && hasPosition);

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || !auth.loggedIn) return;

    sending = true;
    try {
      const [{ nip07Signer }, { getRxNostr }] = await Promise.all([
        import('rx-nostr'),
        import('../nostr/client.js')
      ]);
      const rxNostr = await getRxNostr();
      const posMs = effectiveAttach ? player.position : undefined;
      const params = buildComment(trimmed, contentId, provider, posMs);
      log.info('Sending comment', { positionMs: posMs, contentLength: trimmed.length });
      await rxNostr.cast(params, { signer: nip07Signer() });
      log.info('Comment sent successfully');
      content = '';
    } catch (err) {
      log.error('Failed to send comment', err);
    } finally {
      sending = false;
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
        disabled={!hasPosition}
        onclick={() => (attachPosition = true)}
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200
          {effectiveAttach
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : hasPosition
            ? 'bg-surface-3 text-text-muted hover:text-text-secondary'
            : 'cursor-not-allowed bg-surface-3 text-text-muted/40'}"
      >
        <span class="font-mono">{positionLabel ?? '--:--'}</span>
        <span>時間コメント</span>
      </button>
      <button
        type="button"
        onclick={() => (attachPosition = false)}
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200 {!effectiveAttach
          ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
          : 'bg-surface-3 text-text-muted hover:text-text-secondary'}"
      >
        全体コメント
      </button>
    </div>

    <div class="flex gap-3">
      <input
        type="text"
        bind:value={content}
        placeholder={effectiveAttach ? 'この瞬間にコメント...' : '全体への感想を書く...'}
        disabled={sending}
        class="flex-1 rounded-xl border border-border bg-surface-1 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={sending || !content.trim()}
        class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
      >
        {sending ? '...' : 'Send'}
      </button>
    </div>
  </form>
{:else}
  <div class="rounded-xl border border-dashed border-border py-4 text-center">
    <p class="text-sm text-text-muted">Login to post comments</p>
  </div>
{/if}
