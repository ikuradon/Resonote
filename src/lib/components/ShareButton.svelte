<script lang="ts">
  import { buildShare } from '../nostr/events.js';
  import { castSigned } from '../nostr/client.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import { t } from '../i18n/t.js';
  import type { ContentId, ContentProvider } from '../content/types.js';
  import { createLogger } from '../utils/logger.js';
  import { encodeContentLink } from '../nostr/content-link.js';
  import { DEFAULT_RELAYS } from '../nostr/relays.js';
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
  let copied = $state(false);

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

  async function copyResonoteLink() {
    try {
      const encoded = encodeContentLink(contentId, DEFAULT_RELAYS);
      const url = `https://resonote.pages.dev/${encoded}`;
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      log.error('Failed to copy link', err);
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

<div class="flex items-center gap-2">
  <button
    type="button"
    onclick={copyResonoteLink}
    class="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
    title={t('share.copy_link')}
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
    {#if copied}
      {t('share.copied')}
    {:else}
      {t('share.copy_link')}
    {/if}
  </button>

  {#if auth.loggedIn}
    <div class="relative">
      <button
        type="button"
        onclick={toggle}
        class="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
        title={t('share.title')}
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        {t('share.button')}
      </button>

      {#if open}
        <div
          class="absolute right-0 top-full z-10 mt-2 w-80 rounded-xl border border-border bg-surface-0 p-4 shadow-lg"
        >
          <p class="mb-2 text-xs font-medium text-text-secondary">{t('share.description')}</p>
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
              {t('share.cancel')}
            </button>
            <button
              type="button"
              onclick={share}
              disabled={sending || !content.trim()}
              class="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
            >
              {#if sending}
                <svg
                  class="h-3.5 w-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {t('share.sending')}
              {:else}
                {t('share.post')}
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
