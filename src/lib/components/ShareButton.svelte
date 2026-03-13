<script lang="ts">
  import { buildShare } from '../nostr/events.js';
  import { castSigned } from '../nostr/client.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import type { ContentId, ContentProvider } from '../content/types.js';
  import { createLogger } from '../utils/logger.js';
  import NoteInput from './NoteInput.svelte';

  const log = createLogger('ShareButton');

  interface Props {
    contentId: ContentId;
    provider: ContentProvider;
  }

  let { contentId, provider }: Props = $props();

  const auth = getAuth();
  let open = $state(false);
  let content = $state('');
  let emojiTags = $state<string[][]>([]);
  let sending = $state(false);

  function defaultContent(): string {
    const openUrl = provider.openUrl(contentId);
    const pageUrl = window.location.href;
    return `${openUrl}\n${pageUrl}`;
  }

  function toggle() {
    open = !open;
    if (open) {
      content = defaultContent();
      emojiTags = [];
    }
  }

  async function share() {
    const trimmed = content.trim();
    if (!auth.loggedIn || !trimmed) return;

    sending = true;
    try {
      const tags = emojiTags.length > 0 ? emojiTags : undefined;
      const params = buildShare(trimmed, contentId, provider, tags);
      log.info('Sharing as kind:1', { contentLength: trimmed.length });
      await castSigned(params);
      log.info('Shared successfully');
      open = false;
      content = '';
      emojiTags = [];
    } catch (err) {
      log.error('Failed to share', err);
    } finally {
      sending = false;
    }
  }
</script>

{#if auth.loggedIn}
  <div class="relative">
    <button
      type="button"
      onclick={toggle}
      class="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-4 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
      title="Share as Nostr note"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      Share
    </button>

    {#if open}
      <div
        class="absolute right-0 top-full z-10 mt-2 w-80 rounded-xl border border-border bg-surface-0 p-4 shadow-lg"
      >
        <p class="mb-2 text-xs font-medium text-text-secondary">Share as kind:1 note</p>
        <NoteInput
          bind:content
          bind:emojiTags
          disabled={sending}
          placeholder=""
          rows={5}
          onsubmit={share}
        />
        <div class="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onclick={toggle}
            disabled={sending}
            class="rounded-lg px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={share}
            disabled={sending || !content.trim()}
            class="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
          >
            {sending ? '...' : 'Post'}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
