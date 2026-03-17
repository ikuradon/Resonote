<script lang="ts">
  import { buildShare } from '../nostr/events.js';
  import { castSigned } from '../nostr/client.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import { getPlayer } from '../stores/player.svelte.js';
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
  const player = getPlayer();

  // 'closed' | 'menu' | 'post'
  type ModalState = 'closed' | 'menu' | 'post';
  let modalState = $state<ModalState>('closed');

  let content = $state('');
  let emojiTags = $state<string[][]>([]);
  let sending = $state(false);
  let copiedLink = $state(false);
  let copiedTimedLink = $state(false);

  let positionSec = $derived(Math.floor(player.position / 1000));
  let showTimedLink = $derived(positionSec > 0);

  function formatTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function openMenu() {
    modalState = 'menu';
  }

  function closeModal() {
    modalState = 'closed';
    content = '';
    emojiTags = [];
  }

  function openPostForm() {
    content = defaultContent();
    emojiTags = [];
    modalState = 'post';
  }

  function defaultContent(): string {
    const openUrl = provider.openUrl(contentId);
    const pageUrl = window.location.href;
    return `${openUrl}\n${pageUrl}`;
  }

  async function copyToClipboard(url: string, setCopied: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      log.error('Failed to copy link', err);
    }
  }

  function buildResonoteUrl(withTime = false): string {
    const encoded = encodeContentLink(contentId, DEFAULT_RELAYS);
    const base = `https://resonote.pages.dev/${encoded}`;
    return withTime ? `${base}?t=${positionSec}` : base;
  }

  async function copyResonoteLink() {
    await copyToClipboard(buildResonoteUrl(), (v) => (copiedLink = v));
  }

  async function copyTimedLink() {
    await copyToClipboard(buildResonoteUrl(true), (v) => (copiedTimedLink = v));
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
      closeModal();
    } catch (err) {
      log.error('Failed to share', err);
    } finally {
      sending = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (modalState !== 'closed' && e.key === 'Escape') {
      closeModal();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Share trigger button -->
<button
  type="button"
  onclick={openMenu}
  class="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
  title={t('share.title')}
>
  <svg
    class="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
  {t('share.button')}
</button>

<!-- Modal overlay -->
{#if modalState !== 'closed'}
  <div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onclick={closeModal}
      aria-label={t('dialog.close')}
      tabindex="-1"
    ></button>

    <div
      class="relative mx-4 w-full max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-2xl border border-border bg-surface-0 shadow-xl"
    >
      <!-- Modal header -->
      <div class="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 class="font-display text-base font-semibold text-text-primary">
          {modalState === 'post' ? t('share.title') : t('share.button')}
        </h3>
        <button
          type="button"
          onclick={closeModal}
          class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
          title={t('dialog.close')}
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {#if modalState === 'menu'}
        <!-- Share menu -->
        <div class="p-3">
          {#if showTimedLink}
            <!-- Action: Copy timed link -->
            <button
              type="button"
              onclick={copyTimedLink}
              class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-1"
            >
              <span
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2"
              >
                {#if copiedTimedLink}
                  <svg
                    class="h-4 w-4 text-green-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg
                    class="h-4 w-4 text-text-secondary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                {/if}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-text-primary">
                  {t('share.menu.timed_link')}
                </p>
                <p class="text-xs text-text-muted">{formatTime(positionSec)}</p>
              </div>
              {#if copiedTimedLink}
                <span class="text-xs font-medium text-green-500">{t('share.copied')}</span>
              {/if}
            </button>
          {/if}

          <!-- Action: Copy link -->
          <button
            type="button"
            onclick={copyResonoteLink}
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-1"
          >
            <span
              class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2"
            >
              {#if copiedLink}
                <svg
                  class="h-4 w-4 text-green-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {:else}
                <svg
                  class="h-4 w-4 text-text-secondary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              {/if}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-text-primary">{t('share.menu.link')}</p>
            </div>
            {#if copiedLink}
              <span class="text-xs font-medium text-green-500">{t('share.copied')}</span>
            {/if}
          </button>

          <!-- Action: Post to Nostr (logged in only) -->
          {#if auth.loggedIn}
            <button
              type="button"
              onclick={openPostForm}
              class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-1"
            >
              <span
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2"
              >
                <svg
                  class="h-4 w-4 text-text-secondary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-text-primary">{t('share.menu.nostr')}</p>
              </div>
              <svg
                class="h-4 w-4 text-text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          {/if}
        </div>
      {:else if modalState === 'post'}
        <!-- Post form -->
        <div class="p-4">
          <p class="mb-3 text-xs font-medium text-text-secondary">{t('share.description')}</p>
          <NoteInput
            bind:content
            bind:emojiTags
            disabled={sending}
            placeholder=""
            rows={5}
            onsubmit={share}
          />
          <div class="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onclick={closeModal}
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
                  aria-hidden="true"
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
  </div>
{/if}
